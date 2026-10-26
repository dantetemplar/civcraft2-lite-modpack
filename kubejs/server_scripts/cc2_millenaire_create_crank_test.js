// ============================================================================
// CIVCRAFT 2 - MILLENAIRE CREATE CRANK + MILLAGER LABOR BRIDGE
// Minecraft 1.21.1 / NeoForge
// Millenaire 9.0.0-beta.2
// Create 6.0.10
//
// Put in:
//   kubejs/server_scripts/cc2_millenaire_create_crank_test.js
//
// TEST COMMANDS
// -------------
// Stand inside a registered Millenaire building and run:
//   /cc2crank
//
// Diagnostic scan:
//   /cc2crank scan
//
// Explicit selection point:
//   /cc2crank <x> <y> <z>
//   /cc2crank scan <x> <y> <z>
//
// From a dedicated-server console, coordinates are REQUIRED and the scan uses
// the Overworld:
//   cc2crank <x> <y> <z>
//   cc2crank scan <x> <y> <z>
//
// SELECTION RULE
// --------------
// 1. Read REGISTERED, OPERATIONAL Millenaire buildings.
// 2. Reconstruct each building's current template footprint with Millenaire's
//    own BuildingPlacer.compilePlacementSteps().
// 3. Scan the CURRENT WORLD inside that footprint for create:hand_crank.
//    Player customizations therefore count.
// 4. If the selection point is inside a Millenaire building, THAT building is
//    selected and must contain exactly ONE hand crank.
// 5. Otherwise, the nearest registered building containing exactly one crank
//    is selected.
// 6. The real Create HandCrankBlockEntity is turned. No fake motor is used.
// 7. Create's own isOverStressed() state is checked every pulse. If the player
//    has attached too much machinery, labor stops.
//
// IMPORTANT
// ---------
// This is an ADMIN/DEBUG proof-of-concept command, not the final villager labor
// engine. Once this proves reliable, the command can be replaced by the
// Millenaire abstract labor-item trigger.
// ============================================================================

console.info('[CC2 Create Crank Labor] SCRIPT LOADED - v0.2 dimension fix + duration command')


// ============================================================================
// SETTINGS
// ============================================================================

var CC2CRANK_SELECT_RADIUS = 64
var CC2CRANK_REFRESH_TICKS = 5

// Five seconds. The real Create hand crank only stays "in use" for 10 ticks
// after turn(), so this script refreshes it every 5 ticks during the test.
var CC2CRANK_TEST_DURATION_TICKS = 100

// Safety cap for malformed / enormous building footprints.
var CC2CRANK_MAX_SCAN_VOLUME = 200000


var CC2CRANK_DEBUG = true

// ---------------------------------------------------------------------------
// MILLAGER LABOR BRIDGE
// ---------------------------------------------------------------------------
// A Millenaire crafting gathering_type produces this item INTO THE INVENTORY
// OF THE BUILDING where the Millager worked.
//
// The bridge scans building inventories first. Only buildings containing a
// labor token get their physical footprint scanned for a crank, so ordinary
// village buildings are cheap to ignore.
var CC2LABOR_ITEM_ID = 'kubejs:crank_labor'

// Check for freshly produced labor twice per second.
var CC2LABOR_SCAN_TICKS = 10

// One labor token means "this Millager is presently supplying effort".
// Each new token REFRESHES this duration rather than stacking stored energy.
var CC2LABOR_POWER_TICKS = 160 // 8 seconds

// Do not permit abstract labor to pile up while a machine is broken.
var CC2LABOR_MAX_PENDING = 1

// Keep true while proving the system. Set false later if the console is noisy.
var CC2LABOR_DEBUG = true


// ============================================================================
// JAVA CLASSES
//
// Deliberately do NOT Java.loadClass() any Create class.
// We obtain the real block entity from the world and invoke its PUBLIC methods.
// This avoids unnecessary class-filter / reflection trouble.
// ============================================================================

var $CC2CRANK_VillageSavedData =
    Java.loadClass('org.millenaire.village.VillageSavedData')

var $CC2CRANK_ModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

var $CC2CRANK_BuildingPlacer =
    Java.loadClass('org.millenaire.world.BuildingPlacer')

var $CC2CRANK_BuiltInRegistries =
    Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

var $CC2CRANK_BlockPos =
    Java.loadClass('net.minecraft.core.BlockPos')

var $CC2CRANK_MutableBlockPos =
    Java.loadClass('net.minecraft.core.BlockPos$MutableBlockPos')


var $CC2CRANK_ResourceLocation =
    Java.loadClass('net.minecraft.resources.ResourceLocation')


// ============================================================================
// STATE
// ============================================================================

var CC2CRANK_tickCounter = 0
var CC2LABOR_scanCounter = 0

// key -> {
//   level: ServerLevel,
//   pos: BlockPos,
//   remaining: int,
//   player: ServerPlayer|null,
//   buildingId: string
// }
var CC2CRANK_active = {}


// ============================================================================
// OUTPUT
// ============================================================================

function CC2CRANK_stripFormatting(text) {
    return String(text).replace(/§./g, '')
}


function CC2CRANK_reply(player, text) {

    if (player != null) {
        player.tell(text)
        return
    }

    console.info(
        '[CC2 Create Crank] ' +
        CC2CRANK_stripFormatting(text)
    )
}


// ============================================================================
// BASIC HELPERS
// ============================================================================

function CC2CRANK_blockId(level, pos) {

    return String(
        $CC2CRANK_BuiltInRegistries.BLOCK
            .getKey(
                level
                    .getBlockState(pos)
                    .getBlock()
            )
    )
}


function CC2CRANK_distanceSqXZ(a, b) {

    var dx =
        Number(a.getX()) -
        Number(b.getX())

    var dz =
        Number(a.getZ()) -
        Number(b.getZ())

    return dx * dx + dz * dz
}


function CC2CRANK_inside(bounds, pos) {

    return (
        pos.getX() >= bounds.minX &&
        pos.getX() <= bounds.maxX &&
        pos.getY() >= bounds.minY &&
        pos.getY() <= bounds.maxY &&
        pos.getZ() >= bounds.minZ &&
        pos.getZ() <= bounds.maxZ
    )
}


function CC2CRANK_sessionKey(level, pos) {

    return (
        String(level.dimension) +
        '|' +
        pos.getX() +
        '|' +
        pos.getY() +
        '|' +
        pos.getZ()
    )
}


// ============================================================================
// RECONSTRUCT ONE MILLENAIRE BUILDING'S CURRENT PHYSICAL BOUNDS
//
// This follows the same proven pattern used by the CC2 carpet-marker bridge:
// PlanSet -> current built levels -> BuildingPlacer.compilePlacementSteps().
// ============================================================================

function CC2CRANK_getBuildingBounds(level, building) {

    var planSet =
        $CC2CRANK_ModCultures
            .getBuildingPlanSet(
                building.getPlanSetId()
            )

    if (planSet == null) {
        return null
    }

    var variant =
        building.getVariant()

    var currentLevel =
        building.getLevel()

    var foundAny = false

    var minX = 2147483647
    var minY = 2147483647
    var minZ = 2147483647

    var maxX = -2147483648
    var maxY = -2147483648
    var maxZ = -2147483648


    // Include every built upgrade level, because an earlier level may contain
    // machinery that still physically exists at the current level.
    for (
        var planLevel = 0;
        planLevel <= currentLevel;
        planLevel++
    ) {

        var planId = null

        try {

            planId =
                planSet.getPlanId(
                    variant,
                    planLevel
                )
        }

        catch (planIdError) {
            continue
        }


        if (planId == null) {
            continue
        }


        var plan =
            $CC2CRANK_ModCultures
                .getBuildingPlan(planId)


        if (plan == null) {
            continue
        }


        var placementSteps =
            $CC2CRANK_BuildingPlacer
                .compilePlacementSteps(
                    level,
                    plan,
                    building.getOrigin(),
                    building.getRotation()
                )


        for (
            var i = 0;
            i < placementSteps.size();
            i++
        ) {

            var relativePos =
                placementSteps
                    .get(i)
                    .relativePos()

            // This is the same world-position conversion already proven in
            // CC2's Millenaire carpet-marker system.
            var worldPos =
                building
                    .getOrigin()
                    .offset(relativePos)


            var x = worldPos.getX()
            var y = worldPos.getY()
            var z = worldPos.getZ()

            if (x < minX) minX = x
            if (y < minY) minY = y
            if (z < minZ) minZ = z

            if (x > maxX) maxX = x
            if (y > maxY) maxY = y
            if (z > maxZ) maxZ = z

            foundAny = true
        }
    }


    if (!foundAny) {
        return null
    }


    return {
        minX: minX,
        minY: minY,
        minZ: minZ,
        maxX: maxX,
        maxY: maxY,
        maxZ: maxZ
    }
}


// ============================================================================
// SCAN THE CURRENT WORLD INSIDE A BUILDING FOR ACTUAL CREATE HAND CRANKS
// ============================================================================

function CC2CRANK_findCranks(level, bounds) {

    var sizeX =
        bounds.maxX -
        bounds.minX +
        1

    var sizeY =
        bounds.maxY -
        bounds.minY +
        1

    var sizeZ =
        bounds.maxZ -
        bounds.minZ +
        1

    var volume =
        sizeX *
        sizeY *
        sizeZ


    if (
        volume <= 0 ||
        volume > CC2CRANK_MAX_SCAN_VOLUME
    ) {

        return {
            ok: false,
            volume: volume,
            cranks: [],
            reason: (
                'refusing footprint scan volume ' +
                volume +
                ' blocks'
            )
        }
    }


    var scanPos =
        new $CC2CRANK_MutableBlockPos()

    var cranks = []


    for (
        var y = bounds.minY;
        y <= bounds.maxY;
        y++
    ) {

        for (
            var x = bounds.minX;
            x <= bounds.maxX;
            x++
        ) {

            for (
                var z = bounds.minZ;
                z <= bounds.maxZ;
                z++
            ) {

                scanPos.set(x, y, z)


                if (
                    CC2CRANK_blockId(
                        level,
                        scanPos
                    ) ==
                    'create:hand_crank'
                ) {

                    cranks.push(
                        new $CC2CRANK_BlockPos(
                            x,
                            y,
                            z
                        )
                    )
                }
            }
        }
    }


    return {
        ok: true,
        volume: volume,
        cranks: cranks,
        reason: null
    }
}


// ============================================================================
// COLLECT REGISTERED MILLENAIRE BUILDINGS NEAR A SELECTION POINT
// ============================================================================

function CC2CRANK_collectBuildings(
    level,
    selectionPos
) {

    var savedData =
        $CC2CRANK_VillageSavedData
            .get(level)

    var villages =
        savedData
            .getVillageManager()
            .getAllVillages()
            .iterator()

    var candidates = []

    var maxDistanceSq =
        CC2CRANK_SELECT_RADIUS *
        CC2CRANK_SELECT_RADIUS


    while (villages.hasNext()) {

        var village =
            villages.next()

        var buildings =
            village
                .getBuildings()
                .iterator()


        while (buildings.hasNext()) {

            var building =
                buildings.next()


            if (!building.isOperational()) {
                continue
            }


            // Cheap prefilter before compiling/scanning the whole building.
            var origin =
                building.getOrigin()

            var originDistanceSq =
                CC2CRANK_distanceSqXZ(
                    origin,
                    selectionPos
                )


            if (
                originDistanceSq >
                maxDistanceSq
            ) {
                continue
            }


            var bounds =
                CC2CRANK_getBuildingBounds(
                    level,
                    building
                )


            if (bounds == null) {
                continue
            }


            var crankScan =
                CC2CRANK_findCranks(
                    level,
                    bounds
                )


            candidates.push({
                village: village,
                building: building,
                buildingId:
                    String(
                        building
                            .getPlanSetId()
                    ),
                origin: origin,
                distanceSq:
                    originDistanceSq,
                containsSelection:
                    CC2CRANK_inside(
                        bounds,
                        selectionPos
                    ),
                bounds: bounds,
                scanOk: crankScan.ok,
                scanReason: crankScan.reason,
                scanVolume: crankScan.volume,
                cranks: crankScan.cranks
            })
        }
    }


    candidates.sort(
        function (a, b) {

            // A building that physically contains the selection point wins.
            if (
                a.containsSelection &&
                !b.containsSelection
            ) {
                return -1
            }

            if (
                !a.containsSelection &&
                b.containsSelection
            ) {
                return 1
            }

            return (
                a.distanceSq -
                b.distanceSq
            )
        }
    )


    return candidates
}


// ============================================================================
// DIAGNOSTIC SCAN
// ============================================================================

function CC2CRANK_printScan(
    player,
    candidates
) {

    if (candidates.length == 0) {

        CC2CRANK_reply(
            player,
            '§c[CC2 Crank] No operational registered Millenaire buildings were found within ' +
            CC2CRANK_SELECT_RADIUS +
            ' blocks.'
        )

        return
    }


    CC2CRANK_reply(
        player,
        '§6[CC2 Crank] Nearby registered Millenaire buildings:'
    )


    var limit =
        Math.min(
            candidates.length,
            12
        )


    for (
        var i = 0;
        i < limit;
        i++
    ) {

        var c =
            candidates[i]

        var crankText

        if (!c.scanOk) {

            crankText =
                '§cSCAN REFUSED§7 (' +
                c.scanReason +
                ')'
        }

        else {

            crankText =
                (
                    c.cranks.length == 1
                    ? '§a1 crank'
                    : (
                        c.cranks.length == 0
                        ? '§80 cranks'
                        : '§c' +
                          c.cranks.length +
                          ' cranks'
                    )
                )
        }


        CC2CRANK_reply(
            player,
            (
                '§7- §f' +
                c.buildingId +
                ' §8@ ' +
                c.origin.getX() +
                ', ' +
                c.origin.getY() +
                ', ' +
                c.origin.getZ() +
                ' §7| ' +
                crankText +
                (
                    c.containsSelection
                    ? ' §e[SELECTED POSITION INSIDE]'
                    : ''
                )
            )
        )
    }


    if (
        candidates.length >
        limit
    ) {

        CC2CRANK_reply(
            player,
            '§7...and ' +
            (
                candidates.length -
                limit
            ) +
            ' more.'
        )
    }
}


// ============================================================================
// SELECT ONE MACHINE BUILDING
// ============================================================================

function CC2CRANK_selectMachine(
    candidates
) {

    // FIRST CHOICE:
    // If the selection position is inside a registered building, choose that
    // building even if malformed. That way 0 / 2+ cranks produces a useful
    // error instead of silently activating some neighboring machine.
    for (
        var i = 0;
        i < candidates.length;
        i++
    ) {

        if (
            candidates[i]
                .containsSelection
        ) {
            return candidates[i]
        }
    }


    // SECOND CHOICE:
    // Nearest valid one-crank machine building.
    for (
        var j = 0;
        j < candidates.length;
        j++
    ) {

        if (
            candidates[j].scanOk &&
            candidates[j].cranks.length == 1
        ) {
            return candidates[j]
        }
    }


    return null
}


// ============================================================================
// ACTIVATE THE REAL CREATE HAND CRANK
// ============================================================================

function CC2CRANK_tryTurn(
    level,
    crankPos
) {

    if (
        CC2CRANK_blockId(
            level,
            crankPos
        ) !=
        'create:hand_crank'
    ) {

        return {
            ok: false,
            reason: 'the selected hand crank no longer exists'
        }
    }


    var crank =
        level.getBlockEntity(
            crankPos
        )


    if (crank == null) {

        return {
            ok: false,
            reason: 'Create hand crank block entity was null'
        }
    }


    try {

        // Create 6.0.10 public API on the actual HandCrankBlockEntity.
        // false = normal direction, matching a non-sneaking player interaction.
        crank.turn(false)
    }

    catch (turnError) {

        return {
            ok: false,
            reason: (
                'KubeJS could not call HandCrankBlockEntity.turn(false): ' +
                turnError
            )
        }
    }


    var overStressed = false
    var actualSpeed = null
    var theoreticalSpeed = null


    try {
        overStressed =
            Boolean(
                crank.isOverStressed()
            )
    }

    catch (stressError) {

        return {
            ok: false,
            reason: (
                'turn() worked, but KubeJS could not read isOverStressed(): ' +
                stressError
            )
        }
    }


    try {
        actualSpeed =
            Number(
                crank.getSpeed()
            )
    }

    catch (ignoredSpeedError) {
        actualSpeed = null
    }


    try {
        theoreticalSpeed =
            Number(
                crank.getTheoreticalSpeed()
            )
    }

    catch (ignoredTheoreticalError) {
        theoreticalSpeed = null
    }


    return {
        ok: true,
        overStressed: overStressed,
        actualSpeed: actualSpeed,
        theoreticalSpeed: theoreticalSpeed
    }
}


// ============================================================================
// START FIVE-SECOND TEST SESSION
// ============================================================================

function CC2CRANK_startSession(
    player,
    level,
    candidate
) {

    var crankPos =
        candidate.cranks[0]

    var first =
        CC2CRANK_tryTurn(
            level,
            crankPos
        )


    if (!first.ok) {

        CC2CRANK_reply(
            player,
            '§c[CC2 Crank] ' +
            first.reason
        )

        return
    }


    CC2CRANK_reply(
        player,
        (
            '§6[CC2 Crank] Building: §f' +
            candidate.buildingId
        )
    )


    CC2CRANK_reply(
        player,
        (
            '§6[CC2 Crank] Crank: §f' +
            crankPos.getX() +
            ', ' +
            crankPos.getY() +
            ', ' +
            crankPos.getZ()
        )
    )


    if (first.overStressed) {

        CC2CRANK_reply(
            player,
            (
                '§c[CC2 Crank] OVERSTRESSED. ' +
                'Create rejected the machine load. ' +
                'Labor will NOT be refreshed.'
            )
        )


        if (
            first.theoreticalSpeed != null ||
            first.actualSpeed != null
        ) {

            CC2CRANK_reply(
                player,
                (
                    '§7Theoretical speed: §f' +
                    first.theoreticalSpeed +
                    '§7 | actual speed: §f' +
                    first.actualSpeed
                )
            )
        }

        return
    }


    CC2CRANK_reply(
        player,
        (
            '§a[CC2 Crank] Test power started for ' +
            (
                CC2CRANK_TEST_DURATION_TICKS /
                20
            ) +
            ' seconds.'
        )
    )


    if (
        first.actualSpeed != null
    ) {

        CC2CRANK_reply(
            player,
            (
                '§7Create reports actual speed: §f' +
                first.actualSpeed +
                ' RPM'
            )
        )
    }


    var key =
        CC2CRANK_sessionKey(
            level,
            crankPos
        )


    // Reissuing the command on the same machine simply refreshes the session.
    CC2CRANK_active[key] = {
        level: level,
        pos: crankPos,
        remaining:
            CC2CRANK_TEST_DURATION_TICKS,
        player: player,
        buildingId:
            candidate.buildingId,
        silent: false,
        source: 'debug_command'
    }
}



// ============================================================================
// MILLAGER LABOR ITEM BRIDGE
// ============================================================================

function CC2LABOR_getItem() {

    var id =
        $CC2CRANK_ResourceLocation.parse(
            CC2LABOR_ITEM_ID
        )

    var item =
        $CC2CRANK_BuiltInRegistries.ITEM
            .get(id)

    // If startup registration failed, the registry normally resolves to air.
    var resolvedId =
        String(
            $CC2CRANK_BuiltInRegistries.ITEM
                .getKey(item)
        )

    if (
        resolvedId !=
        CC2LABOR_ITEM_ID
    ) {
        return null
    }

    return item
}


function CC2LABOR_debug(text) {

    if (CC2LABOR_DEBUG) {
        console.info(
            '[CC2 Crank Labor] ' +
            text
        )
    }
}


function CC2LABOR_warn(text) {

    console.warn(
        '[CC2 Crank Labor] ' +
        text
    )
}


function CC2LABOR_getBuildingInventory(building) {

    try {

        var inventory =
            building.getInventory()

        if (inventory != null) {
            return inventory
        }
    }

    catch (inventoryError) {
    }

    return null
}


function CC2LABOR_getCrankScan(level, building) {

    var bounds =
        CC2CRANK_getBuildingBounds(
            level,
            building
        )

    if (bounds == null) {

        return {
            ok: false,
            cranks: [],
            reason: 'could not reconstruct Millenaire footprint'
        }
    }

    return CC2CRANK_findCranks(
        level,
        bounds
    )
}


function CC2LABOR_refreshSession(
    level,
    building,
    crankPos
) {

    var key =
        CC2CRANK_sessionKey(
            level,
            crankPos
        )

    var existing =
        CC2CRANK_active[key]

    if (existing != null) {

        // IMPORTANT:
        // Refresh rather than add time. Labor is a "still working" heartbeat,
        // not a battery that can be stockpiled while the Millager sleeps.
        existing.remaining =
            CC2LABOR_POWER_TICKS

        existing.silent = true
        existing.source = 'millager_labor'
        existing.buildingId =
            String(
                building.getPlanSetId()
            )

        return
    }


    CC2CRANK_active[key] = {
        level: level,
        pos: crankPos,
        remaining:
            CC2LABOR_POWER_TICKS,
        player: null,
        buildingId:
            String(
                building.getPlanSetId()
            ),
        silent: true,
        source: 'millager_labor'
    }
}


function CC2LABOR_processBuilding(
    level,
    building,
    laborItem
) {

    if (
        building == null ||
        !building.isOperational()
    ) {
        return
    }


    var inventory =
        CC2LABOR_getBuildingInventory(
            building
        )

    if (inventory == null) {
        return
    }


    var laborCount = 0

    try {

        laborCount =
            inventory.getCount(
                level,
                laborItem
            )
    }

    catch (countError) {

        CC2LABOR_warn(
            'Could not read labor inventory for ' +
            building.getPlanSetId() +
            ': ' +
            countError
        )

        return
    }


    if (laborCount <= 0) {
        return
    }


    // Broken/overloaded machines must not become banks full of stored human
    // effort. Keep at most one pending heartbeat.
    if (
        laborCount >
        CC2LABOR_MAX_PENDING
    ) {

        var excess =
            laborCount -
            CC2LABOR_MAX_PENDING

        try {

            inventory.remove(
                level,
                laborItem,
                excess
            )

            laborCount =
                CC2LABOR_MAX_PENDING
        }

        catch (trimError) {

            CC2LABOR_warn(
                'Could not trim excess labor tokens in ' +
                building.getPlanSetId() +
                ': ' +
                trimError
            )
        }
    }


    var scan =
        CC2LABOR_getCrankScan(
            level,
            building
        )


    if (!scan.ok) {

        CC2LABOR_debug(
            'Labor waiting in ' +
            building.getPlanSetId() +
            ', but crank scan failed: ' +
            scan.reason
        )

        return
    }


    if (
        scan.cranks.length != 1
    ) {

        CC2LABOR_debug(
            'Labor waiting in ' +
            building.getPlanSetId() +
            ', but building currently contains ' +
            scan.cranks.length +
            ' hand cranks. Expected exactly 1.'
        )

        return
    }


    var crankPos =
        scan.cranks[0]


    var first =
        CC2CRANK_tryTurn(
            level,
            crankPos
        )


    if (!first.ok) {

        CC2LABOR_warn(
            'Crank activation failed for ' +
            building.getPlanSetId() +
            ': ' +
            first.reason
        )

        return
    }


    if (first.overStressed) {

        // Leave ONE token pending. If the player fixes the machinery, the next
        // scan can immediately start it. Any extra new labor is trimmed above.
        CC2LABOR_debug(
            'OVERSTRESSED: ' +
            building.getPlanSetId() +
            ' @ ' +
            crankPos.getX() +
            ', ' +
            crankPos.getY() +
            ', ' +
            crankPos.getZ()
        )

        return
    }


    // Consume exactly one heartbeat only after a valid crank accepted power.
    var removed = 0

    try {

        removed =
            inventory.remove(
                level,
                laborItem,
                1
            )
    }

    catch (removeError) {

        CC2LABOR_warn(
            'Crank turned, but labor token could not be consumed for ' +
            building.getPlanSetId() +
            ': ' +
            removeError
        )

        return
    }


    if (removed <= 0) {
        return
    }


    CC2LABOR_refreshSession(
        level,
        building,
        crankPos
    )


    CC2LABOR_debug(
        'PULSE: ' +
        building.getPlanSetId() +
        ' crank=' +
        crankPos.getX() +
        ',' +
        crankPos.getY() +
        ',' +
        crankPos.getZ() +
        ' speed=' +
        first.actualSpeed +
        ' RPM; labor refreshed to ' +
        (
            CC2LABOR_POWER_TICKS /
            20
        ) +
        's'
    )
}


function CC2LABOR_scanLevel(level) {

    var laborItem =
        CC2LABOR_getItem()

    if (laborItem == null) {

        CC2LABOR_warn(
            'Missing item ' +
            CC2LABOR_ITEM_ID +
            '. Did you install the startup script and FULLY restart Minecraft?'
        )

        return
    }


    var savedData =
        $CC2CRANK_VillageSavedData
            .get(level)

    var villages =
        savedData
            .getVillageManager()
            .getAllVillages()
            .iterator()


    while (villages.hasNext()) {

        var village =
            villages.next()

        var buildings =
            village
                .getBuildings()
                .iterator()


        while (buildings.hasNext()) {

            CC2LABOR_processBuilding(
                level,
                buildings.next(),
                laborItem
            )
        }
    }
}


// ============================================================================
// DEBUG COMMAND FOR THE LABOR BRIDGE
//
// /cc2labor          -> inject one labor heartbeat into selected building
// /cc2labor inject   -> same
// /cc2labor status   -> show labor count + crank count
//
// This deliberately writes through Millenaire BuildingInventory, exactly where
// CraftingHandler outputs its products. So "inject" proves the bridge BEFORE
// the villager/gathering_type is involved.
// ============================================================================

ServerEvents.basicCommand(
    'cc2labor',
    function (event) {

        try {

            var player =
                event.player

            if (player == null) {

                CC2CRANK_reply(
                    null,
                    '§c[CC2 Labor] Run this debug command as a player while standing inside/near the machine building.'
                )

                return
            }


            var raw =
                event.input == null
                ? ''
                : String(event.input)
                    .trim()
                    .toLowerCase()

            var mode =
                raw.length == 0
                ? 'inject'
                : raw


            if (
                mode == 'help'
            ) {

                CC2CRANK_reply(
                    player,
                    '§6/cc2labor §7or §6/cc2labor inject §7- put one labor heartbeat into this Millenaire machine building'
                )

                CC2CRANK_reply(
                    player,
                    '§6/cc2labor status §7- show labor/crank status and current activation duration'
                )

                CC2CRANK_reply(
                    player,
                    '§6/cc2labor duration <seconds> §7- change Millager crank duration immediately'
                )

                return
            }


            if (
                mode.indexOf('duration ') == 0
            ) {

                var secondsText =
                    mode.substring('duration '.length).trim()

                var seconds =
                    Number(secondsText)

                if (
                    !isFinite(seconds) ||
                    seconds <= 0 ||
                    seconds > 3600
                ) {

                    CC2CRANK_reply(
                        player,
                        '§c[CC2 Labor] Duration must be a number from 0.05 to 3600 seconds.'
                    )

                    return
                }

                CC2LABOR_POWER_TICKS =
                    Math.max(
                        1,
                        Math.round(seconds * 20)
                    )

                // Update any currently active Millager-labor sessions too.
                for (
                    var activeKey in CC2CRANK_active
                ) {

                    var activeSession =
                        CC2CRANK_active[activeKey]

                    if (
                        activeSession != null &&
                        activeSession.source == 'millager_labor'
                    ) {

                        activeSession.remaining =
                            CC2LABOR_POWER_TICKS
                    }
                }

                CC2CRANK_reply(
                    player,
                    (
                        '§a[CC2 Labor] Millager crank duration set to §f' +
                        (
                            CC2LABOR_POWER_TICKS /
                            20
                        ) +
                        ' seconds§a (' +
                        CC2LABOR_POWER_TICKS +
                        ' ticks).'
                    )
                )

                return
            }


            if (
                mode != 'inject' &&
                mode != 'status'
            ) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Labor] Usage: /cc2labor [inject|status|duration <seconds>|help]'
                )

                return
            }


            var level =
                player.serverLevel()

            var selectionPos =
                player.blockPosition()

            var candidates =
                CC2CRANK_collectBuildings(
                    level,
                    selectionPos
                )

            var selected =
                CC2CRANK_selectMachine(
                    candidates
                )


            if (selected == null) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Labor] No nearby registered Millenaire one-crank machine building found.'
                )

                return
            }


            var building =
                selected.building

            var inventory =
                CC2LABOR_getBuildingInventory(
                    building
                )


            if (inventory == null) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Labor] Selected building has no Millenaire BuildingInventory. Add a recognized chest/container to the building.'
                )

                return
            }


            var laborItem =
                CC2LABOR_getItem()


            if (laborItem == null) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Labor] kubejs:crank_labor does not exist. FULL restart required after installing startup script.'
                )

                return
            }


            var scan =
                CC2LABOR_getCrankScan(
                    level,
                    building
                )

            var current =
                inventory.getCount(
                    level,
                    laborItem
                )


            if (
                mode == 'status'
            ) {

                CC2CRANK_reply(
                    player,
                    (
                        '§6[CC2 Labor] Building: §f' +
                        selected.buildingId
                    )
                )

                CC2CRANK_reply(
                    player,
                    (
                        '§7Labor tokens: §f' +
                        current +
                        '§7 | physical hand cranks: §f' +
                        (
                            scan.ok
                            ? scan.cranks.length
                            : 'SCAN ERROR'
                        )
                    )
                )

                CC2CRANK_reply(
                    player,
                    (
                        '§7Activation duration: §f' +
                        (
                            CC2LABOR_POWER_TICKS /
                            20
                        ) +
                        ' seconds§7 (' +
                        CC2LABOR_POWER_TICKS +
                        ' ticks)'
                    )
                )

                return
            }


            var added =
                inventory.add(
                    level,
                    laborItem,
                    1
                )


            if (added <= 0) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Labor] Could not insert labor token. Is the building inventory full or missing usable containers?'
                )

                return
            }


            CC2CRANK_reply(
                player,
                (
                    '§a[CC2 Labor] Injected 1 labor heartbeat into §f' +
                    selected.buildingId +
                    '§a. The bridge should consume it and spin the crank within ' +
                    (
                        CC2LABOR_SCAN_TICKS /
                        20
                    ) +
                    ' seconds.'
                )
            )
        }

        catch (error) {

            CC2CRANK_reply(
                event.player,
                (
                    '§c[CC2 Labor] SCRIPT ERROR: ' +
                    error
                )
            )

            console.error(
                '[CC2 Crank Labor] ' +
                error
            )
        }
    }
)


// ============================================================================
// SERVER TICK: KEEP ACTIVE REAL CRANKS "PULLED"
// ============================================================================

ServerEvents.tick(function (event) {

    CC2CRANK_tickCounter++


    if (
        CC2CRANK_tickCounter <
        CC2CRANK_REFRESH_TICKS
    ) {
        return
    }


    CC2CRANK_tickCounter = 0


    for (
        var key in CC2CRANK_active
    ) {

        var session =
            CC2CRANK_active[key]


        if (
            session == null
        ) {
            delete CC2CRANK_active[key]
            continue
        }


        session.remaining -=
            CC2CRANK_REFRESH_TICKS


        if (
            session.remaining <= 0
        ) {

            if (!session.silent) {

                CC2CRANK_reply(
                    session.player,
                    (
                        '§7[CC2 Crank] Test labor ended for §f' +
                        session.buildingId +
                        '§7. Create will let the crank wind down naturally.'
                    )
                )
            }

            delete CC2CRANK_active[key]
            continue
        }


        var pulse =
            CC2CRANK_tryTurn(
                session.level,
                session.pos
            )


        if (!pulse.ok) {

            if (session.silent) {

                CC2LABOR_warn(
                    'Active labor stopped for ' +
                    session.buildingId +
                    ': ' +
                    pulse.reason
                )
            }

            else {

                CC2CRANK_reply(
                    session.player,
                    (
                        '§c[CC2 Crank] Test stopped: ' +
                        pulse.reason
                    )
                )
            }

            delete CC2CRANK_active[key]
            continue
        }


        if (
            pulse.overStressed
        ) {

            if (session.silent) {

                CC2LABOR_debug(
                    'OVERSTRESSED during active labor: ' +
                    session.buildingId
                )
            }

            else {

                CC2CRANK_reply(
                    session.player,
                    (
                        '§c[CC2 Crank] OVERSTRESSED during operation. ' +
                        'Villager labor stopped.'
                    )
                )


                if (
                    pulse.theoreticalSpeed != null ||
                    pulse.actualSpeed != null
                ) {

                    CC2CRANK_reply(
                        session.player,
                        (
                            '§7Theoretical speed: §f' +
                            pulse.theoreticalSpeed +
                            '§7 | actual speed: §f' +
                            pulse.actualSpeed
                        )
                    )
                }
            }


            delete CC2CRANK_active[key]
        }
    }

    // Every CC2LABOR_SCAN_TICKS, look for labor heartbeats in Millenaire
    // building inventories. Millenaire villages are currently an Overworld
    // system in CivCraft 2, so v0.2 intentionally scans the Overworld only.
    CC2LABOR_scanCounter +=
        CC2CRANK_REFRESH_TICKS

    if (
        CC2LABOR_scanCounter >=
        CC2LABOR_SCAN_TICKS
    ) {

        CC2LABOR_scanCounter = 0

        try {

            CC2LABOR_scanLevel(
                event.server.overworld()
            )
        }

        catch (laborScanError) {

            CC2LABOR_warn(
                'Background scan failed: ' +
                laborScanError
            )
        }
    }

})


// ============================================================================
// COMMAND
// ============================================================================

ServerEvents.basicCommand(
    'cc2crank',
    function (event) {

        try {

            var player =
                event.player

            var raw =
                event.input == null
                ? ''
                : String(event.input)
                    .trim()

            var parts =
                raw.length == 0
                ? []
                : raw.split(/\s+/)

            var scanOnly = false


            if (
                parts.length > 0 &&
                String(parts[0])
                    .toLowerCase() ==
                    'help'
            ) {

                CC2CRANK_reply(
                    player,
                    '§6/cc2crank §7- spin the selected/nearest one-crank Millenaire machine'
                )

                CC2CRANK_reply(
                    player,
                    '§6/cc2crank scan §7- show nearby registered buildings and crank counts'
                )

                CC2CRANK_reply(
                    player,
                    '§6/cc2crank <x> <y> <z>'
                )

                CC2CRANK_reply(
                    player,
                    '§6/cc2crank scan <x> <y> <z>'
                )

                return
            }


            if (
                parts.length > 0 &&
                String(parts[0])
                    .toLowerCase() ==
                    'scan'
            ) {

                scanOnly = true
                parts.shift()
            }


            if (
                parts.length > 0 &&
                String(parts[0])
                    .toLowerCase() ==
                    'spin'
            ) {
                parts.shift()
            }


            var level = null
            var selectionPos = null


            // Explicit coordinates.
            if (
                parts.length == 3
            ) {

                var x =
                    Number(parts[0])

                var y =
                    Number(parts[1])

                var z =
                    Number(parts[2])


                if (
                    !isFinite(x) ||
                    !isFinite(y) ||
                    !isFinite(z)
                ) {

                    CC2CRANK_reply(
                        player,
                        '§c[CC2 Crank] Coordinates must be numbers.'
                    )

                    return
                }


                x = Math.floor(x)
                y = Math.floor(y)
                z = Math.floor(z)


                selectionPos =
                    new $CC2CRANK_BlockPos(
                        x,
                        y,
                        z
                    )


                // A player uses their current dimension.
                // Dedicated-server console uses the Overworld.
                level =
                    player != null
                    ? player.serverLevel()
                    : event.server.overworld()
            }


            // No explicit coordinates: select from the player's location.
            else if (
                parts.length == 0
            ) {

                if (
                    player == null
                ) {

                    CC2CRANK_reply(
                        null,
                        '§c[CC2 Crank] Server console requires coordinates: cc2crank <x> <y> <z>'
                    )

                    return
                }


                level =
                    player.serverLevel()

                selectionPos =
                    player.blockPosition()
            }


            else {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Crank] Usage: /cc2crank [scan] [x y z]'
                )

                return
            }


            CC2CRANK_reply(
                player,
                (
                    '§7[CC2 Crank] Checking registered Millenaire buildings near §f' +
                    selectionPos.getX() +
                    ', ' +
                    selectionPos.getY() +
                    ', ' +
                    selectionPos.getZ() +
                    '§7...'
                )
            )


            var candidates =
                CC2CRANK_collectBuildings(
                    level,
                    selectionPos
                )


            if (scanOnly) {

                CC2CRANK_printScan(
                    player,
                    candidates
                )

                return
            }


            var selected =
                CC2CRANK_selectMachine(
                    candidates
                )


            if (selected == null) {

                CC2CRANK_reply(
                    player,
                    '§c[CC2 Crank] No nearby registered Millenaire machine with exactly one hand crank was found.'
                )

                CC2CRANK_reply(
                    player,
                    '§7Run §f/cc2crank scan§7 for diagnostics.'
                )

                return
            }


            if (!selected.scanOk) {

                CC2CRANK_reply(
                    player,
                    (
                        '§c[CC2 Crank] Selected building footprint could not be scanned: ' +
                        selected.scanReason
                    )
                )

                return
            }


            if (
                selected.cranks.length == 0
            ) {

                CC2CRANK_reply(
                    player,
                    (
                        '§c[CC2 Crank] Selected Millenaire building §f' +
                        selected.buildingId +
                        '§c contains ZERO physical Create hand cranks.'
                    )
                )

                return
            }


            if (
                selected.cranks.length > 1
            ) {

                CC2CRANK_reply(
                    player,
                    (
                        '§c[CC2 Crank] Selected Millenaire building §f' +
                        selected.buildingId +
                        '§c contains ' +
                        selected.cranks.length +
                        ' hand cranks. Refusing ambiguous activation.'
                    )
                )

                return
            }


            CC2CRANK_startSession(
                player,
                level,
                selected
            )
        }


        catch (error) {

            CC2CRANK_reply(
                event.player,
                (
                    '§c[CC2 Crank] SCRIPT ERROR: ' +
                    error
                )
            )

            console.error(
                '[CC2 Create Crank Test] ' +
                error
            )
        }
    }
)
