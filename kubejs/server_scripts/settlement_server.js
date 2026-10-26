// ============================================================
// CivCraft 2 — Settlement System v0.6 ABILITIES
// SERVER SCRIPT
// Put in: kubejs/server_scripts/
//
// ARCHITECTURE
// ------------------------------------------------------------
// Millénaire Building       = building
// Millénaire Village/LB     = CivCraft district
// CivCraft Settlement       = many districts
// Palace                    = settlement anchor/controller
//
// v0.4 BUILDS ON v0.3 AND ADDS:
// - physical settlement stock across linked districts
// - normal villages AND lone buildings can supply transactions
// - reservation-aware Millenaire availability
// - atomic preflight -> commit -> rollback transaction broker
// - per-district/per-building withdrawal accounting
// - persistent transaction history
// - Settlement Requisition testing/admin item
// - STOCK, PROVISIONS and TRANSACTIONS Palace sign pages
//
// v0.3 ADDS:
// - configurable 2048-block Palace administrative radius
// - normal villages AND lone buildings can be linked as districts
// - candidate counting inside Palace radius
// - generic modular stat accumulator
// - building stat tags: cc2_stat_<name>_<integer>
// - persistent Palace sign bindings
// - automatic live sign refresh
// - sign pages for overview, districts, population, food,
//   housing, security, fuel, tools, logistics, treasury,
//   commerce, prosperity, projects, trade, health, policy
//
// PALACE BUILDING REQUIREMENT
// ------------------------------------------------------------
// Keep the Palace BuildingPlanSet tag:
//
//   "tags": [
//       "settlement_palace"
//   ]
// ============================================================

(() => {

    // ========================================================
    // JAVA CLASSES — CHECKED AGAINST MILLENAIRE 9.0.0-beta.2
    // ========================================================

    const $CC2SetVillageSavedData =
        Java.loadClass('org.millenaire.village.VillageSavedData')

    const $CC2SetModCultures =
        Java.loadClass('org.millenaire.culture.ModCultures')

    const $CC2SetVillageId =
        Java.loadClass('org.millenaire.village.VillageId')

    const $CC2SetUUID =
        Java.loadClass('java.util.UUID')

    const $CC2SetBlockPos =
        Java.loadClass('net.minecraft.core.BlockPos')

    const $CC2SetSignBlockEntity =
        Java.loadClass('net.minecraft.world.level.block.entity.SignBlockEntity')

    const $CC2SetSignText =
        Java.loadClass('net.minecraft.world.level.block.entity.SignText')

    const $CC2SetComponent =
        Java.loadClass('net.minecraft.network.chat.Component')

    const $CC2SetGoodAvailabilityHelper =
        Java.loadClass('org.millenaire.building.GoodAvailabilityHelper')

    const $CC2SetBuiltInRegistries =
        Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

    const $CC2SetResourceLocation =
        Java.loadClass('net.minecraft.resources.ResourceLocation')

    const $CC2SetItemStack =
        Java.loadClass('net.minecraft.world.item.ItemStack')


    // ========================================================
    // CONFIG
    // ========================================================

    const CC2SET_DATA_VERSION = 5

    const CC2SET_PALACE_TAG =
        'settlement_palace'

    // Player must stand reasonably near a Millénaire village/LB
    // to target it with the ledger.
    const CC2SET_DISTRICT_LOOKUP_RADIUS =
        192.0

    // THIS is the actual settlement administrative radius.
    // District centers must lie within this horizontal distance
    // from the Palace building origin.
    const CC2SET_PALACE_DISTRICT_RADIUS =
        2048.0

    // Palace signs must be physically near the Palace.
    const CC2SET_PALACE_SIGN_BIND_RADIUS =
        256.0

    // Refresh bound signs every 10 seconds.
    const CC2SET_SIGN_REFRESH_TICKS =
        200

    // Number of transaction history records kept per settlement.
    const CC2SET_TRANSACTION_HISTORY_LIMIT =
        50

    // Physical stock lives in actual Millenaire building inventories.
    // To access a distant linked district during an occasional
    // transaction, we may synchronously load the chunks containing
    // its registered chests. This is NOT done every tick.
    const CC2SET_TX_LOAD_INVENTORY_CHUNKS =
        true

    // Safety cap for unique source chunks warmed during one audit/
    // transaction. If a gigantic settlement exceeds this, the broker
    // stops warming additional chunks rather than going wild.
    const CC2SET_TX_MAX_WARMED_CHUNKS =
        256

    // Keep old key so existing v0.2 settlements survive upgrade.
    const CC2SET_DATA_KEY =
        'civcraft2_settlement_system_v1'

    const CC2SET_PLAYER_SELECTED_KEY =
        'civcraft2_selected_settlement_v1'

    const CC2SET_LOG_PREFIX =
        '[CC2 Settlement Core] '

    var CC2SET_TICK_COUNTER = 0


    // ========================================================
    // BUILDING STAT RULES
    //
    // IMPORTANT:
    // KubeJS 1.21 server/client scripts do not allow scripts
    // to assign values onto `global`.
    //
    // Therefore these rules live LOCALLY inside this server
    // script instead of using:
    //
    //   global.CC2SET_BUILDING_STAT_RULES = ...
    //
    // Add exact BuildingPlanSet rules here later if desired.
    // The data-driven cc2_stat_* Millenaire tags still work
    // independently of this table.
    // ========================================================

    const CC2SET_BUILDING_STAT_RULES = {

        // ----------------------------------------------------
        // CivCraft 2 starter balance.
        //
        // These values are deliberately SIMPLE and visible.
        // They are the first-pass city-sim numbers, not sacred
        // final balance. cc2_stat_* JSON tags still stack on top.
        // ----------------------------------------------------

        // Government / capital
        'millenaire:civnormans/palace': {
            security_supply: 12,
            logistics_capacity: 16,
            housing_capacity: 6,
            commerce: 4,
            administration_supply: 40
        },

        // Food
        'millenaire:civnormans/foragershut': {
            food_supply: 10,
            logistics_demand: 1,
            tools_demand: 1
        },

        'millenaire:civnormans/kitchen': {
            food_supply: 8,
            food_service: 24,
            fuel_demand: 2,
            logistics_demand: 1
        },

        // Production
        'millenaire:civnormans/kiln': {
            industry_supply: 8,
            ceramics_supply: 10,
            fuel_demand: 4,
            tools_demand: 1
        },

        'millenaire:civnormans/lumberjackhut': {
            timber_supply: 16,
            fuel_supply: 12,
            tools_demand: 2,
            logistics_demand: 2
        },

        'millenaire:civnormans/lumberjack': {
            timber_supply: 16,
            fuel_supply: 12,
            tools_demand: 2,
            logistics_demand: 2
        },

        'millenaire:civnormans/coppermine': {
            copper_supply: 14,
            industry_supply: 8,
            tools_demand: 3,
            logistics_demand: 3
        },

        'millenaire:civnormans/workshop': {
            tools_supply: 10,
            industry_supply: 10,
            fuel_demand: 2,
            logistics_demand: 1
        },

        // Military
        'millenaire:civnormans/fortress': {
            security_supply: 36,
            housing_capacity: 8,
            food_demand: 8,
            tools_demand: 3,
            logistics_demand: 4
        },

        // Housing / early civic buildings
        'millenaire:civnormans/town_hovel': {
            housing_capacity: 5
        },

        'millenaire:civnormans/townhovel': {
            housing_capacity: 5
        },

        'millenaire:civnormans/meetinghall': {
            housing_capacity: 4,
            security_supply: 3,
            logistics_capacity: 4,
            administration_supply: 10
        },

        'millenaire:civnormans/survivalmeetinghall': {
            housing_capacity: 4,
            security_supply: 3,
            logistics_capacity: 4,
            administration_supply: 10
        },

        'millenaire:civnormans/well': {
            health_supply: 6,
            sanitation_supply: 8
        },

        'millenaire:civnormans/grove': {
            timber_supply: 6,
            fuel_supply: 4,
            food_supply: 2
        }
    }


    // ========================================================
    // SIGN PAGE ORDER
    // ========================================================

    const CC2SET_SIGN_CHANNELS = [
        'overview',
        'districts',
        'population',
        'food',
        'housing',
        'security',
        'fuel',
        'tools',
        'logistics',
        'treasury',
        'commerce',
        'prosperity',
        'projects',
        'trade',
        'health',
        'stock',
        'provisions',
        'transactions',
        'abilities',
        'policy'
    ]


    // ========================================================
    // DATABASE
    // ========================================================

    function cc2setEmptyDatabase() {
        return {
            version: CC2SET_DATA_VERSION,
            settlements: {}
        }
    }


    function cc2setEnsureSettlementShape(settlement) {

        if (settlement.districts == null) {
            settlement.districts = {}
        }

        if (settlement.signs == null) {
            settlement.signs = {}
        }

        if (settlement.values == null) {
            settlement.values = {}
        }

        if (settlement.values.treasury == null) {
            settlement.values.treasury = 0
        }

        if (settlement.values.prosperity == null) {
            settlement.values.prosperity = 0
        }

        if (settlement.values.stability == null) {
            settlement.values.stability = 0
        }

        if (settlement.values.commerce == null) {
            settlement.values.commerce = 0
        }

        if (settlement.values.health == null) {
            settlement.values.health = 0
        }

        if (settlement.values.trade == null) {
            settlement.values.trade = 0
        }

        if (settlement.values.policy == null) {
            settlement.values.policy = 'Default'
        }

        if (settlement.values.project == null) {
            settlement.values.project = 'None'
        }

        if (settlement.values.stockWatchItem == null) {
            settlement.values.stockWatchItem = ''
        }

        if (settlement.transactionHistory == null) {
            settlement.transactionHistory = []
        }

        // v0.5: a Palace settlement may later belong to exactly
        // one Industrial-Age civilization governed by a Capitol Center.
        if (settlement.civilizationId == null) {
            settlement.civilizationId = ''
        }

        // v0.5.1 modular extension buckets.
        // cc2_civic_extensions.js owns these values.
        if (settlement.addonStats == null) {
            settlement.addonStats = {}
        }

        if (settlement.addonAbilities == null) {
            settlement.addonAbilities = []
        }

        if (settlement.addonBreakdown == null) {
            settlement.addonBreakdown = {}
        }

        // v0.6 Settlement Ability engine buckets.
        if (settlement.abilityStats == null) {
            settlement.abilityStats = {}
        }

        if (settlement.abilityCooldowns == null) {
            settlement.abilityCooldowns = {}
        }

        if (settlement.activeAbilities == null) {
            settlement.activeAbilities = {}
        }

        if (settlement.abilityHistory == null) {
            settlement.abilityHistory = []
        }

        if (settlement.abilityDisplayNames == null) {
            settlement.abilityDisplayNames = {}
        }

        if (settlement.administrativeRadius == null) {
            settlement.administrativeRadius =
                CC2SET_PALACE_DISTRICT_RADIUS
        }

        return settlement
    }


    function cc2setLoadDatabase(server) {

        try {

            var raw =
                server.persistentData.getString(
                    CC2SET_DATA_KEY
                )

            if (
                raw == null ||
                String(raw).trim() === ''
            ) {
                return cc2setEmptyDatabase()
            }

            var parsed =
                JSON.parse(
                    String(raw)
                )

            if (
                parsed == null ||
                typeof parsed !== 'object'
            ) {
                return cc2setEmptyDatabase()
            }

            if (parsed.settlements == null) {
                parsed.settlements = {}
            }

            var ids =
                Object.keys(
                    parsed.settlements
                )

            for (
                var i = 0;
                i < ids.length;
                i++
            ) {
                cc2setEnsureSettlementShape(
                    parsed.settlements[
                        ids[i]
                    ]
                )
            }

            parsed.version =
                CC2SET_DATA_VERSION

            return parsed
        }

        catch (e) {

            console.error(
                CC2SET_LOG_PREFIX +
                'Could not read settlement database: ' +
                e
            )

            return cc2setEmptyDatabase()
        }
    }


    function cc2setSaveDatabase(server, db) {

        db.version =
            CC2SET_DATA_VERSION

        server.persistentData.putString(
            CC2SET_DATA_KEY,
            JSON.stringify(db)
        )
    }


    // ========================================================
    // BASIC HELPERS
    // ========================================================

    function cc2setGetContext(player) {

        var level =
            player.serverLevel()

        var savedData =
            $CC2SetVillageSavedData.get(
                level
            )

        return {
            level: level,
            savedData: savedData,
            manager:
                savedData.getVillageManager()
        }
    }


    function cc2setFindCurrentDistrict(
        player,
        manager
    ) {

        return manager.findNearestVillage(
            player.blockPosition(),
            CC2SET_DISTRICT_LOOKUP_RADIUS
        )
    }


    function cc2setVillageUUID(village) {

        return String(
            village.getId()
                .uuid()
                .toString()
        )
    }


    function cc2setDimensionId(level) {

        try {
            return String(
                level.dimension()
                    .location()
            )
        }

        catch (e) {
            return 'minecraft:overworld'
        }
    }


    function cc2setBlockPosObject(pos) {

        return {
            x: pos.getX(),
            y: pos.getY(),
            z: pos.getZ()
        }
    }


    function cc2setObjectToBlockPos(obj) {

        return new $CC2SetBlockPos(
            Number(obj.x),
            Number(obj.y),
            Number(obj.z)
        )
    }


    function cc2setDistanceXZObjects(a, b) {

        var dx =
            Number(a.x) -
            Number(b.x)

        var dz =
            Number(a.z) -
            Number(b.z)

        return Math.sqrt(
            dx * dx +
            dz * dz
        )
    }


    function cc2setDistanceXZPos(
        posA,
        posB
    ) {

        var dx =
            posA.getX() -
            posB.getX()

        var dz =
            posA.getZ() -
            posB.getZ()

        return Math.sqrt(
            dx * dx +
            dz * dz
        )
    }


    function cc2setVillageSnapshot(
        village,
        settlement
    ) {

        var center =
            cc2setBlockPosObject(
                village.getCenter()
            )

        var palaceOrigin =
            settlement != null &&
            settlement.palace != null
                ? settlement.palace.origin
                : null

        return {
            villageUuid:
                cc2setVillageUUID(
                    village
                ),

            name:
                String(
                    village.getVillageName()
                ),

            culture:
                String(
                    village.getCultureId()
                ),

            villageType:
                String(
                    village.getVillageTypeId()
                ),

            kind:
                village.isLoneBuilding()
                    ? 'lone_building'
                    : 'village',

            center:
                center,

            distanceFromPalace:
                palaceOrigin == null
                    ? 0
                    : Math.round(
                        cc2setDistanceXZObjects(
                            palaceOrigin,
                            center
                        )
                    )
        }
    }


    function cc2setIsSignBlockId(id) {

        id = String(id)

        return (
            id.indexOf('minecraft:') === 0 &&
            (
                id.endsWith('_sign') ||
                id.endsWith('_wall_sign') ||
                id.endsWith('_hanging_sign') ||
                id.endsWith('_wall_hanging_sign')
            )
        )
    }


    function cc2setCleanSignLine(value) {

        var text =
            String(value == null ? '' : value)

        // Keep vanilla signs readable.
        if (text.length > 20) {
            text =
                text.substring(0, 20)
        }

        return text
    }


    // ========================================================
    // PALACE DETECTION
    // ========================================================

    function cc2setFindPalace(village) {

        var buildings =
            village.getBuildings()

        if (buildings == null) {
            return null
        }

        for (
            var i = 0;
            i < buildings.size();
            i++
        ) {

            var building =
                buildings.get(i)

            try {

                var planSet =
                    $CC2SetModCultures
                        .getBuildingPlanSet(
                            building.getPlanSetId()
                        )

                if (
                    planSet != null &&
                    planSet.hasTag(
                        CC2SET_PALACE_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            try {

                var plan =
                    $CC2SetModCultures
                        .getBuildingPlan(
                            building.getPlanId()
                        )

                if (
                    plan != null &&
                    plan.hasTag(
                        CC2SET_PALACE_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            try {

                if (
                    building.hasRuntimeTag(
                        CC2SET_PALACE_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            // Safe Norman fallback.
            try {

                if (
                    String(
                        building.getPlanSetId()
                    ) ===
                    'millenaire:civnormans/palace'
                ) {
                    return building
                }
            }

            catch (e) {
            }
        }

        return null
    }


    // ========================================================
    // SETTLEMENT LOOKUPS
    // ========================================================

    function cc2setMakeSettlementId(
        palaceVillage,
        palaceBuilding
    ) {

        var villageUuid =
            cc2setVillageUUID(
                palaceVillage
            )

        var pos =
            palaceBuilding.getOrigin()

        return (
            'settlement_' +
            villageUuid.replace(/-/g, '') +
            '_' +
            pos.getX() +
            '_' +
            pos.getY() +
            '_' +
            pos.getZ()
        )
    }


    function cc2setFindSettlementForDistrict(
        db,
        villageUuid
    ) {

        var ids =
            Object.keys(
                db.settlements
            )

        for (
            var i = 0;
            i < ids.length;
            i++
        ) {

            var settlement =
                cc2setEnsureSettlementShape(
                    db.settlements[
                        ids[i]
                    ]
                )

            if (
                settlement.districts[
                    villageUuid
                ] != null
            ) {
                return settlement
            }
        }

        return null
    }


    function cc2setGetSelectedSettlement(
        player,
        db
    ) {

        var selectedId =
            player.persistentData
                .getString(
                    CC2SET_PLAYER_SELECTED_KEY
                )

        if (
            selectedId == null ||
            String(selectedId).trim() === ''
        ) {
            return null
        }

        var settlement =
            db.settlements[
                String(selectedId)
            ]

        if (settlement == null) {
            return null
        }

        return cc2setEnsureSettlementShape(
            settlement
        )
    }


    function cc2setSelectSettlement(
        player,
        settlement
    ) {

        player.persistentData.putString(
            CC2SET_PLAYER_SELECTED_KEY,
            settlement.id
        )
    }


    // ========================================================
    // RESOLUTION
    // ========================================================

    function cc2setResolveDistrict(
        manager,
        uuidString
    ) {

        try {

            var javaUuid =
                $CC2SetUUID.fromString(
                    String(uuidString)
                )

            return manager.getVillage(
                new $CC2SetVillageId(
                    javaUuid
                )
            )
        }

        catch (e) {
            return null
        }
    }


    function cc2setResolveLevel(
        server,
        dimensionId
    ) {

        try {

            var levels =
                server.getAllLevels()

            var iterator =
                levels.iterator()

            while (
                iterator.hasNext()
            ) {

                var level =
                    iterator.next()

                if (
                    cc2setDimensionId(
                        level
                    ) ===
                    String(dimensionId)
                ) {
                    return level
                }
            }
        }

        catch (e) {
        }

        return null
    }


    // ========================================================
    // CREATE SETTLEMENT
    // ========================================================

    function cc2setCreateOrGetPalaceSettlement(
        player,
        context,
        db,
        village,
        palace
    ) {

        var settlementId =
            cc2setMakeSettlementId(
                village,
                palace
            )

        var existing =
            db.settlements[
                settlementId
            ]

        if (existing != null) {

            existing =
                cc2setEnsureSettlementShape(
                    existing
                )

            cc2setSelectSettlement(
                player,
                existing
            )

            return {
                settlement: existing,
                created: false
            }
        }


        var palaceVillageUuid =
            cc2setVillageUUID(
                village
            )

        var alreadyOwned =
            cc2setFindSettlementForDistrict(
                db,
                palaceVillageUuid
            )

        if (alreadyOwned != null) {

            return {
                error:
                    'This Palace district already belongs to settlement "' +
                    alreadyOwned.name +
                    '".'
            }
        }


        var settlement = {

            id:
                settlementId,

            name:
                String(
                    village.getVillageName()
                ),

            dimension:
                cc2setDimensionId(
                    context.level
                ),

            administrativeRadius:
                CC2SET_PALACE_DISTRICT_RADIUS,

            createdBy: {
                uuid:
                    String(
                        player.uuid
                    ),

                name:
                    String(
                        player.name.string
                    )
            },

            createdAt:
                Date.now(),

            palace: {
                districtVillageUuid:
                    palaceVillageUuid,

                planId:
                    String(
                        palace.getPlanId()
                    ),

                planSetId:
                    String(
                        palace.getPlanSetId()
                    ),

                origin:
                    cc2setBlockPosObject(
                        palace.getOrigin()
                    )
            },

            districts: {},
            signs: {},
            transactionHistory: [],
            civilizationId: '',
            addonStats: {},
            addonAbilities: [],
            addonBreakdown: {},
            abilityStats: {},
            abilityCooldowns: {},
            activeAbilities: {},
            abilityHistory: [],
            abilityDisplayNames: {},

            values: {
                treasury: 0,
                prosperity: 0,
                stability: 0,
                commerce: 0,
                health: 0,
                trade: 0,
                policy: 'Default',
                project: 'None',
                stockWatchItem: ''
            }
        }


        settlement.districts[
            palaceVillageUuid
        ] =
            cc2setVillageSnapshot(
                village,
                settlement
            )


        db.settlements[
            settlementId
        ] =
            settlement


        cc2setSaveDatabase(
            player.server,
            db
        )


        cc2setSelectSettlement(
            player,
            settlement
        )


        console.info(
            CC2SET_LOG_PREFIX +
            'Created settlement "' +
            settlement.name +
            '" with Palace radius ' +
            settlement.administrativeRadius +
            '.'
        )


        return {
            settlement: settlement,
            created: true
        }
    }


    // ========================================================
    // DISTRICT RADIUS / LINKING
    // ========================================================

    function cc2setDistrictDistanceFromPalace(
        settlement,
        village
    ) {

        var palaceOrigin =
            cc2setObjectToBlockPos(
                settlement.palace.origin
            )

        return cc2setDistanceXZPos(
            palaceOrigin,
            village.getCenter()
        )
    }


    function cc2setIsInsideAdministrativeRadius(
        settlement,
        village
    ) {

        return (
            cc2setDistrictDistanceFromPalace(
                settlement,
                village
            ) <=
            Number(
                settlement.administrativeRadius
            )
        )
    }


    function cc2setLinkDistrict(
        player,
        context,
        db,
        settlement,
        village
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )


        if (
            settlement.dimension !==
            cc2setDimensionId(
                context.level
            )
        ) {

            return {
                error:
                    'District and Palace are not in the same dimension.'
            }
        }


        var villageUuid =
            cc2setVillageUUID(
                village
            )


        var existingOwner =
            cc2setFindSettlementForDistrict(
                db,
                villageUuid
            )


        if (existingOwner != null) {

            if (
                existingOwner.id ===
                settlement.id
            ) {

                return {
                    alreadyLinked: true,
                    settlement: settlement
                }
            }

            return {
                error:
                    'This district already belongs to settlement "' +
                    existingOwner.name +
                    '".'
            }
        }


        var distance =
            cc2setDistrictDistanceFromPalace(
                settlement,
                village
            )


        if (
            distance >
            Number(
                settlement.administrativeRadius
            )
        ) {

            return {
                error:
                    'This district is ' +
                    Math.round(distance) +
                    ' blocks from the Palace, beyond its ' +
                    settlement.administrativeRadius +
                    '-block administrative radius.'
            }
        }


        settlement.districts[
            villageUuid
        ] =
            cc2setVillageSnapshot(
                village,
                settlement
            )


        cc2setSaveDatabase(
            player.server,
            db
        )


        console.info(
            CC2SET_LOG_PREFIX +
            'Linked ' +
            (
                village.isLoneBuilding()
                    ? 'lone building'
                    : 'village'
            ) +
            ' district "' +
            village.getVillageName() +
            '" at distance ' +
            Math.round(distance) +
            ' to settlement "' +
            settlement.name +
            '".'
        )


        return {
            linked: true,
            settlement: settlement,
            distance: distance
        }
    }


    function cc2setCountCandidates(
        context,
        db,
        settlement
    ) {

        var all =
            context.manager
                .getAllVillages()

        var iterator =
            all.iterator()

        var villages = 0
        var loneBuildings = 0

        while (
            iterator.hasNext()
        ) {

            var candidate =
                iterator.next()

            var uuid =
                cc2setVillageUUID(
                    candidate
                )

            if (
                settlement.districts[
                    uuid
                ] != null
            ) {
                continue
            }

            if (
                cc2setFindSettlementForDistrict(
                    db,
                    uuid
                ) != null
            ) {
                continue
            }

            if (
                !cc2setIsInsideAdministrativeRadius(
                    settlement,
                    candidate
                )
            ) {
                continue
            }


            if (
                candidate.isLoneBuilding()
            ) {
                loneBuildings++
            }

            else {
                villages++
            }
        }

        return {
            villages: villages,
            loneBuildings: loneBuildings
        }
    }



    // ========================================================
    // PHYSICAL SETTLEMENT STOCK + TRANSACTION BROKER
    //
    // IMPORTANT MODEL:
    // - settlement stats are abstract
    // - physical items remain in actual Millenaire inventories
    // - linked lone buildings participate exactly like villages
    // - a transaction first builds a complete withdrawal plan
    // - NOTHING is removed unless the entire request is satisfiable
    // - Millenaire's GoodAvailabilityHelper protects reserved stock
    // ========================================================

    function cc2setResolveItem(itemId) {

        try {

            var id =
                $CC2SetResourceLocation.parse(
                    String(itemId)
                )

            var item =
                $CC2SetBuiltInRegistries.ITEM.get(
                    id
                )

            if (item == null) {
                return null
            }

            var actualId =
                $CC2SetBuiltInRegistries.ITEM.getKey(
                    item
                )

            if (
                actualId == null ||
                String(actualId) !==
                String(id)
            ) {
                return null
            }

            return item
        }

        catch (e) {
            return null
        }
    }


    function cc2setItemId(item) {

        try {

            var id =
                $CC2SetBuiltInRegistries.ITEM.getKey(
                    item
                )

            return id == null
                ? 'minecraft:air'
                : String(id)
        }

        catch (e) {
            return 'minecraft:air'
        }
    }


    function cc2setWarmInventoryChunks(
        level,
        building,
        warmed
    ) {

        if (
            !CC2SET_TX_LOAD_INVENTORY_CHUNKS
        ) {
            return
        }


        function warm(pos) {

            if (
                pos == null ||
                warmed.count >=
                    CC2SET_TX_MAX_WARMED_CHUNKS
            ) {
                return
            }


            var cx =
                Math.floor(
                    pos.getX() / 16
                )

            var cz =
                Math.floor(
                    pos.getZ() / 16
                )

            var key =
                cx + ',' + cz


            if (
                warmed.keys[
                    key
                ]
            ) {
                return
            }


            warmed.keys[
                key
            ] = true

            warmed.count++


            // Occasional synchronous load for a real physical
            // settlement transaction. We do not force-keep it loaded.
            level.getChunkAt(
                pos
            )
        }


        warm(
            building.getOrigin()
        )


        try {

            var inventory =
                building.getInventory()

            if (inventory == null) {
                return
            }

            var positions =
                inventory.getChestPositions()

            for (
                var i = 0;
                i < positions.size();
                i++
            ) {

                warm(
                    positions.get(i)
                )
            }
        }

        catch (e) {
        }
    }


    function cc2setSafeAvailableInBuilding(
        level,
        village,
        building,
        item
    ) {

        if (
            building == null ||
            !building.isOperational()
        ) {
            return 0
        }


        var inventory =
            building.getInventory()

        if (inventory == null) {
            return 0
        }


        try {

            // false, false intentionally preserves Millenaire's
            // normal construction/shop/resident reserve deductions.
            return Math.max(
                0,
                Number(
                    $CC2SetGoodAvailabilityHelper
                        .nbGoodAvailable(
                            building,
                            item,
                            level,
                            village,
                            village.getCultureId(),
                            false,
                            false
                        )
                )
            )
        }

        catch (e) {

            console.error(
                CC2SET_LOG_PREFIX +
                'Availability check failed for ' +
                building.getPlanSetId() +
                ': ' +
                e
            )

            return 0
        }
    }


    function cc2setCollectStockSources(
        level,
        manager,
        settlement,
        item
    ) {

        var sources = []

        var districtTotals = {}

        var warmed = {
            keys: {},
            count: 0
        }


        var districtIds =
            Object.keys(
                settlement.districts
            )


        for (
            var i = 0;
            i < districtIds.length;
            i++
        ) {

            var districtId =
                districtIds[i]

            var village =
                cc2setResolveDistrict(
                    manager,
                    districtId
                )


            if (village == null) {
                continue
            }


            var districtName =
                String(
                    village.getVillageName()
                )

            var districtKind =
                village.isLoneBuilding()
                    ? 'lone_building'
                    : 'village'


            var buildings =
                village.getBuildings()


            for (
                var b = 0;
                b < buildings.size();
                b++
            ) {

                var building =
                    buildings.get(b)


                if (
                    !building.isOperational()
                ) {
                    continue
                }


                var inventory =
                    building.getInventory()

                if (inventory == null) {
                    continue
                }


                cc2setWarmInventoryChunks(
                    level,
                    building,
                    warmed
                )


                var safe =
                    cc2setSafeAvailableInBuilding(
                        level,
                        village,
                        building,
                        item
                    )


                if (safe <= 0) {
                    continue
                }


                if (
                    districtTotals[
                        districtId
                    ] == null
                ) {

                    districtTotals[
                        districtId
                    ] = {
                        villageUuid:
                            districtId,

                        districtName:
                            districtName,

                        districtKind:
                            districtKind,

                        available:
                            0
                    }
                }


                districtTotals[
                    districtId
                ].available +=
                    safe


                sources.push({
                    village:
                        village,

                    building:
                        building,

                    inventory:
                        inventory,

                    villageUuid:
                        districtId,

                    districtName:
                        districtName,

                    districtKind:
                        districtKind,

                    buildingPlanSetId:
                        String(
                            building.getPlanSetId()
                        ),

                    buildingOrigin:
                        cc2setBlockPosObject(
                            building.getOrigin()
                        ),

                    available:
                        safe
                })
            }
        }


        // Resource-rich sources supply first. This naturally makes
        // specialist lone buildings useful without hardcoding them.
        sources.sort(
            function(a, b) {

                if (
                    b.available !==
                    a.available
                ) {
                    return (
                        b.available -
                        a.available
                    )
                }

                return String(
                    a.districtName
                ).localeCompare(
                    String(
                        b.districtName
                    )
                )
            }
        )


        var total = 0

        for (
            var s = 0;
            s < sources.length;
            s++
        ) {
            total +=
                sources[s].available
        }


        return {
            total:
                total,

            sources:
                sources,

            districtTotals:
                districtTotals,

            warmedChunks:
                warmed.count
        }
    }


    function cc2setAuditExactItem(
        level,
        manager,
        settlement,
        item
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )

        var collected =
            cc2setCollectStockSources(
                level,
                manager,
                settlement,
                item
            )

        return {
            item:
                item,

            itemId:
                cc2setItemId(
                    item
                ),

            total:
                collected.total,

            sources:
                collected.sources,

            districtTotals:
                collected.districtTotals,

            warmedChunks:
                collected.warmedChunks
        }
    }


    function cc2setBuildWithdrawalPlan(
        level,
        manager,
        settlement,
        item,
        amount
    ) {

        amount =
            Math.max(
                0,
                Math.floor(
                    Number(amount)
                )
            )


        var audit =
            cc2setAuditExactItem(
                level,
                manager,
                settlement,
                item
            )


        if (
            amount <= 0
        ) {

            return {
                valid: false,
                requested: amount,
                available: audit.total,
                missing: 0,
                item: item,
                itemId: audit.itemId,
                withdrawals: [],
                audit: audit
            }
        }


        if (
            audit.total <
            amount
        ) {

            return {
                valid: false,
                requested: amount,
                available: audit.total,
                missing:
                    amount -
                    audit.total,
                item: item,
                itemId: audit.itemId,
                withdrawals: [],
                audit: audit
            }
        }


        var remaining =
            amount

        var withdrawals = []


        for (
            var i = 0;
            i < audit.sources.length;
            i++
        ) {

            if (
                remaining <= 0
            ) {
                break
            }


            var source =
                audit.sources[i]

            var take =
                Math.min(
                    remaining,
                    source.available
                )


            if (take <= 0) {
                continue
            }


            withdrawals.push({
                village:
                    source.village,

                building:
                    source.building,

                inventory:
                    source.inventory,

                villageUuid:
                    source.villageUuid,

                districtName:
                    source.districtName,

                districtKind:
                    source.districtKind,

                buildingPlanSetId:
                    source.buildingPlanSetId,

                buildingOrigin:
                    source.buildingOrigin,

                amount:
                    take
            })


            remaining -=
                take
        }


        return {
            valid:
                remaining === 0,

            requested:
                amount,

            available:
                audit.total,

            missing:
                remaining,

            item:
                item,

            itemId:
                audit.itemId,

            withdrawals:
                withdrawals,

            audit:
                audit
        }
    }


    function cc2setRollbackWithdrawal(
        level,
        item,
        committed
    ) {

        for (
            var i =
                committed.length - 1;
            i >= 0;
            i--
        ) {

            var entry =
                committed[i]

            try {

                var restored =
                    entry.inventory.add(
                        level,
                        item,
                        entry.amount
                    )

                if (
                    restored !==
                    entry.amount
                ) {

                    console.error(
                        CC2SET_LOG_PREFIX +
                        'ROLLBACK WARNING: requested restore=' +
                        entry.amount +
                        ', restored=' +
                        restored +
                        ', building=' +
                        entry.buildingPlanSetId
                    )
                }
            }

            catch (e) {

                console.error(
                    CC2SET_LOG_PREFIX +
                    'ROLLBACK ERROR at ' +
                    entry.buildingPlanSetId +
                    ': ' +
                    e
                )
            }
        }
    }


    function cc2setRecordTransaction(
        server,
        db,
        settlement,
        label,
        actorName,
        itemId,
        amount,
        committed
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )


        var withdrawals = []


        for (
            var i = 0;
            i < committed.length;
            i++
        ) {

            var entry =
                committed[i]

            withdrawals.push({
                districtVillageUuid:
                    entry.villageUuid,

                districtName:
                    entry.districtName,

                districtKind:
                    entry.districtKind,

                buildingPlanSetId:
                    entry.buildingPlanSetId,

                buildingOrigin:
                    entry.buildingOrigin,

                amount:
                    entry.amount
            })
        }


        settlement.transactionHistory.push({
            id:
                'tx_' +
                Date.now() +
                '_' +
                Math.floor(
                    Math.random() *
                    1000000
                ),

            timestamp:
                Date.now(),

            label:
                String(label),

            actor:
                String(actorName),

            item:
                String(itemId),

            amount:
                Number(amount),

            resources: [
                {
                    item:
                        String(itemId),

                    amount:
                        Number(amount)
                }
            ],

            withdrawals:
                withdrawals
        })


        while (
            settlement.transactionHistory.length >
            CC2SET_TRANSACTION_HISTORY_LIMIT
        ) {

            settlement.transactionHistory.shift()
        }


        cc2setSaveDatabase(
            server,
            db
        )
    }


    function cc2setCommitWithdrawalPlan(
        server,
        db,
        level,
        settlement,
        plan,
        label,
        actorName
    ) {

        if (
            plan == null ||
            !plan.valid
        ) {

            return {
                success: false,
                reason: 'preflight_failed',
                requested:
                    plan == null
                        ? 0
                        : plan.requested,
                available:
                    plan == null
                        ? 0
                        : plan.available,
                missing:
                    plan == null
                        ? 0
                        : plan.missing
            }
        }


        // SECOND PREFLIGHT immediately before touching inventory.
        // Same tick in normal use, but this protects future callers.
        var secondPlan =
            cc2setBuildWithdrawalPlan(
                level,
                $CC2SetVillageSavedData
                    .get(level)
                    .getVillageManager(),
                settlement,
                plan.item,
                plan.requested
            )


        if (
            !secondPlan.valid
        ) {

            return {
                success: false,
                reason: 'stock_changed_before_commit',
                requested:
                    plan.requested,
                available:
                    secondPlan.available,
                missing:
                    secondPlan.missing
            }
        }


        var committed = []


        for (
            var i = 0;
            i < secondPlan.withdrawals.length;
            i++
        ) {

            var entry =
                secondPlan.withdrawals[i]


            var removed =
                entry.inventory.remove(
                    level,
                    secondPlan.item,
                    entry.amount
                )


            if (
                Number(removed) !==
                Number(entry.amount)
            ) {

                if (
                    Number(removed) > 0
                ) {

                    committed.push({
                        inventory:
                            entry.inventory,

                        villageUuid:
                            entry.villageUuid,

                        districtName:
                            entry.districtName,

                        districtKind:
                            entry.districtKind,

                        buildingPlanSetId:
                            entry.buildingPlanSetId,

                        buildingOrigin:
                            entry.buildingOrigin,

                        amount:
                            Number(removed)
                    })
                }


                cc2setRollbackWithdrawal(
                    level,
                    secondPlan.item,
                    committed
                )


                return {
                    success: false,
                    reason: 'commit_failed_and_rolled_back',
                    requested:
                        secondPlan.requested,
                    available:
                        secondPlan.available,
                    failedBuilding:
                        entry.buildingPlanSetId
                }
            }


            committed.push({
                inventory:
                    entry.inventory,

                villageUuid:
                    entry.villageUuid,

                districtName:
                    entry.districtName,

                districtKind:
                    entry.districtKind,

                buildingPlanSetId:
                    entry.buildingPlanSetId,

                buildingOrigin:
                    entry.buildingOrigin,

                amount:
                    entry.amount
            })
        }


        cc2setRecordTransaction(
            server,
            db,
            settlement,
            label,
            actorName,
            secondPlan.itemId,
            secondPlan.requested,
            committed
        )


        return {
            success: true,
            item:
                secondPlan.item,

            itemId:
                secondPlan.itemId,

            amount:
                secondPlan.requested,

            withdrawals:
                committed
        }
    }


    function cc2setPerformExactItemTransaction(
        server,
        db,
        level,
        manager,
        settlement,
        item,
        amount,
        label,
        actorName
    ) {

        var plan =
            cc2setBuildWithdrawalPlan(
                level,
                manager,
                settlement,
                item,
                amount
            )


        if (
            !plan.valid
        ) {

            return {
                success: false,
                reason: 'insufficient_stock',
                requested: plan.requested,
                available: plan.available,
                missing: plan.missing,
                itemId: plan.itemId,
                audit: plan.audit
            }
        }


        return cc2setCommitWithdrawalPlan(
            server,
            db,
            level,
            settlement,
            plan,
            label,
            actorName
        )
    }



    // ========================================================
    // MULTI-RESOURCE ATOMIC TRANSACTION
    //
    // Future Palace projects should use THIS shape:
    //
    // [
    //   { item: 'tfc:metal/ingot/copper', amount: 32 },
    //   { item: 'kubejs:grain_provisions', amount: 12 },
    //   { item: 'minecraft:oak_planks', amount: 48 }
    // ]
    //
    // ALL requirements are preflighted before any inventory is
    // touched. If any resource is short, NOTHING is consumed.
    // ========================================================

    function cc2setNormalizeRequirements(
        requirements
    ) {

        var merged = {}
        var errors = []


        if (
            requirements == null
        ) {

            return {
                valid: false,
                requirements: [],
                errors: [
                    'No requirements supplied.'
                ]
            }
        }


        for (
            var i = 0;
            i < requirements.length;
            i++
        ) {

            var req =
                requirements[i]

            if (req == null) {
                continue
            }


            var itemId =
                String(
                    req.item ||
                    req.itemId ||
                    ''
                )

            var amount =
                Math.floor(
                    Number(
                        req.amount || 0
                    )
                )


            if (
                itemId === '' ||
                amount <= 0
            ) {

                errors.push(
                    'Invalid requirement at index ' +
                    i +
                    '.'
                )

                continue
            }


            var item =
                cc2setResolveItem(
                    itemId
                )


            if (item == null) {

                errors.push(
                    'Unknown item: ' +
                    itemId
                )

                continue
            }


            var canonical =
                cc2setItemId(
                    item
                )


            if (
                merged[
                    canonical
                ] == null
            ) {

                merged[
                    canonical
                ] = {
                    itemId:
                        canonical,

                    item:
                        item,

                    amount:
                        0
                }
            }


            merged[
                canonical
            ].amount +=
                amount
        }


        var keys =
            Object.keys(
                merged
            )

        var normalized = []


        for (
            var k = 0;
            k < keys.length;
            k++
        ) {

            normalized.push(
                merged[
                    keys[k]
                ]
            )
        }


        return {
            valid:
                errors.length === 0 &&
                normalized.length > 0,

            requirements:
                normalized,

            errors:
                errors
        }
    }


    function cc2setPreflightMultiTransaction(
        level,
        manager,
        settlement,
        requirements
    ) {

        var normalized =
            cc2setNormalizeRequirements(
                requirements
            )


        if (
            !normalized.valid
        ) {

            return {
                valid: false,
                reason: 'invalid_requirements',
                errors:
                    normalized.errors,
                requirements:
                    normalized.requirements,
                plans: [],
                missing: []
            }
        }


        var plans = []
        var missing = []


        for (
            var i = 0;
            i < normalized.requirements.length;
            i++
        ) {

            var req =
                normalized.requirements[i]

            var plan =
                cc2setBuildWithdrawalPlan(
                    level,
                    manager,
                    settlement,
                    req.item,
                    req.amount
                )


            plans.push(
                plan
            )


            if (
                !plan.valid
            ) {

                missing.push({
                    item:
                        req.itemId,

                    requested:
                        req.amount,

                    available:
                        plan.available,

                    missing:
                        plan.missing
                })
            }
        }


        return {
            valid:
                missing.length === 0,

            reason:
                missing.length === 0
                    ? null
                    : 'insufficient_stock',

            requirements:
                normalized.requirements,

            plans:
                plans,

            missing:
                missing
        }
    }


    function cc2setRollbackMultiTransaction(
        level,
        committedGroups
    ) {

        for (
            var g =
                committedGroups.length - 1;
            g >= 0;
            g--
        ) {

            var group =
                committedGroups[g]

            cc2setRollbackWithdrawal(
                level,
                group.item,
                group.entries
            )
        }
    }


    function cc2setRecordMultiTransaction(
        server,
        db,
        settlement,
        label,
        actorName,
        requirements,
        committedGroups
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )


        var resources = []
        var withdrawals = []


        for (
            var r = 0;
            r < requirements.length;
            r++
        ) {

            resources.push({
                item:
                    requirements[r].itemId,

                amount:
                    requirements[r].amount
            })
        }


        for (
            var g = 0;
            g < committedGroups.length;
            g++
        ) {

            var group =
                committedGroups[g]


            for (
                var i = 0;
                i < group.entries.length;
                i++
            ) {

                var entry =
                    group.entries[i]

                withdrawals.push({
                    item:
                        group.itemId,

                    districtVillageUuid:
                        entry.villageUuid,

                    districtName:
                        entry.districtName,

                    districtKind:
                        entry.districtKind,

                    buildingPlanSetId:
                        entry.buildingPlanSetId,

                    buildingOrigin:
                        entry.buildingOrigin,

                    amount:
                        entry.amount
                })
            }
        }


        settlement.transactionHistory.push({
            id:
                'tx_' +
                Date.now() +
                '_' +
                Math.floor(
                    Math.random() *
                    1000000
                ),

            timestamp:
                Date.now(),

            label:
                String(label),

            actor:
                String(actorName),

            multiResource:
                true,

            resources:
                resources,

            withdrawals:
                withdrawals
        })


        while (
            settlement.transactionHistory.length >
            CC2SET_TRANSACTION_HISTORY_LIMIT
        ) {

            settlement.transactionHistory.shift()
        }


        cc2setSaveDatabase(
            server,
            db
        )
    }


    function cc2setPerformMultiItemTransaction(
        server,
        db,
        level,
        manager,
        settlement,
        requirements,
        label,
        actorName
    ) {

        // FIRST WHOLE-ORDER PREFLIGHT.
        var first =
            cc2setPreflightMultiTransaction(
                level,
                manager,
                settlement,
                requirements
            )


        if (
            !first.valid
        ) {

            return {
                success: false,
                reason:
                    first.reason,
                errors:
                    first.errors || [],
                missing:
                    first.missing || []
            }
        }


        // SECOND WHOLE-ORDER PREFLIGHT immediately before commit.
        var second =
            cc2setPreflightMultiTransaction(
                level,
                manager,
                settlement,
                requirements
            )


        if (
            !second.valid
        ) {

            return {
                success: false,
                reason:
                    'stock_changed_before_commit',
                missing:
                    second.missing || []
            }
        }


        var committedGroups = []


        for (
            var p = 0;
            p < second.plans.length;
            p++
        ) {

            var plan =
                second.plans[p]

            var group = {
                item:
                    plan.item,

                itemId:
                    plan.itemId,

                entries:
                    []
            }


            for (
                var i = 0;
                i < plan.withdrawals.length;
                i++
            ) {

                var entry =
                    plan.withdrawals[i]

                var removed =
                    entry.inventory.remove(
                        level,
                        plan.item,
                        entry.amount
                    )


                if (
                    Number(removed) > 0
                ) {

                    group.entries.push({
                        inventory:
                            entry.inventory,

                        villageUuid:
                            entry.villageUuid,

                        districtName:
                            entry.districtName,

                        districtKind:
                            entry.districtKind,

                        buildingPlanSetId:
                            entry.buildingPlanSetId,

                        buildingOrigin:
                            entry.buildingOrigin,

                        amount:
                            Number(removed)
                    })
                }


                if (
                    Number(removed) !==
                    Number(entry.amount)
                ) {

                    // Include the current partial group before rollback.
                    if (
                        group.entries.length >
                        0
                    ) {

                        committedGroups.push(
                            group
                        )
                    }


                    cc2setRollbackMultiTransaction(
                        level,
                        committedGroups
                    )


                    return {
                        success: false,
                        reason:
                            'commit_failed_and_rolled_back',
                        failedItem:
                            plan.itemId,
                        failedBuilding:
                            entry.buildingPlanSetId
                    }
                }
            }


            committedGroups.push(
                group
            )
        }


        cc2setRecordMultiTransaction(
            server,
            db,
            settlement,
            label,
            actorName,
            second.requirements,
            committedGroups
        )


        return {
            success: true,
            multiResource: true,
            resources:
                second.requirements,
            committedGroups:
                committedGroups
        }
    }


    function cc2setSafeStockById(
        level,
        manager,
        settlement,
        itemId
    ) {

        var item =
            cc2setResolveItem(
                itemId
            )

        if (item == null) {
            return 0
        }

        return cc2setAuditExactItem(
            level,
            manager,
            settlement,
            item
        ).total
    }


    function cc2setLastTransaction(
        settlement
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )

        if (
            settlement.transactionHistory.length ===
            0
        ) {
            return null
        }

        return settlement.transactionHistory[
            settlement.transactionHistory.length -
            1
        ]
    }


    function cc2setShortItemPath(itemId) {

        var text =
            String(itemId || '')

        var colon =
            text.indexOf(':')

        if (
            colon >= 0 &&
            colon <
            text.length - 1
        ) {
            text =
                text.substring(
                    colon + 1
                )
        }

        if (
            text.length >
            18
        ) {
            text =
                text.substring(
                    0,
                    18
                )
        }

        return text
    }


    // ========================================================
    // GENERIC STAT ENGINE
    // ========================================================

    function cc2setNewStats() {

        return {
            district_count: 0,
            village_districts: 0,
            lone_building_districts: 0,

            population: 0,
            building_count: 0,
            operational_buildings: 0,

            food_supply: 0,
            food_demand: 0,
            food_service: 0,

            housing_capacity: 0,
            housing_demand: 0,

            security_supply: 0,
            security_demand: 0,

            fuel_supply: 0,
            fuel_demand: 0,

            tools_supply: 0,
            tools_demand: 0,

            logistics_capacity: 0,
            logistics_demand: 0,

            administration_supply: 0,
            industry_supply: 0,
            timber_supply: 0,
            copper_supply: 0,
            ceramics_supply: 0,
            health_supply: 0,
            health_demand: 0,
            sanitation_supply: 0,

            treasury: 0,
            commerce: 0,
            prosperity: 0,
            stability: 0,
            trade: 0,
            health: 0,

            resolved_districts: 0,
            missing_districts: 0
        }
    }


    function cc2setAddStat(
        stats,
        key,
        amount
    ) {

        key =
            String(key)

        amount =
            Number(amount)

        if (
            !isFinite(amount)
        ) {
            return
        }

        if (
            stats[key] == null
        ) {
            stats[key] = 0
        }

        stats[key] += amount
    }


    function cc2setApplyStatTag(
        stats,
        tag
    ) {

        var match =
            /^cc2_stat_(.+)_(-?\d+)$/
                .exec(
                    String(tag)
                )

        if (match == null) {
            return
        }

        cc2setAddStat(
            stats,
            match[1],
            parseInt(
                match[2]
            )
        )
    }


    function cc2setApplyTagCollection(
        stats,
        collection,
        seen
    ) {

        if (collection == null) {
            return
        }

        try {

            var iterator =
                collection.iterator()

            while (
                iterator.hasNext()
            ) {

                var tag =
                    String(
                        iterator.next()
                    )

                if (seen[tag]) {
                    continue
                }

                seen[tag] = true

                cc2setApplyStatTag(
                    stats,
                    tag
                )
            }
        }

        catch (e) {
        }
    }


    function cc2setApplyBuildingStats(
        stats,
        building
    ) {

        if (
            !building.isOperational()
        ) {
            return
        }


        var planSetId =
            String(
                building.getPlanSetId()
            )

        // Exact-ID rule table from config file.
        try {

            var rules =
                CC2SET_BUILDING_STAT_RULES

            if (
                rules != null &&
                rules[
                    planSetId
                ] != null
            ) {

                var rule =
                    rules[
                        planSetId
                    ]

                var keys =
                    Object.keys(
                        rule
                    )

                for (
                    var i = 0;
                    i < keys.length;
                    i++
                ) {

                    cc2setAddStat(
                        stats,
                        keys[i],
                        rule[
                            keys[i]
                        ]
                    )
                }
            }
        }

        catch (e) {
        }


        // Data-driven Millénaire tags.
        var seen = {}

        try {

            var planSet =
                $CC2SetModCultures
                    .getBuildingPlanSet(
                        building.getPlanSetId()
                    )

            if (planSet != null) {

                cc2setApplyTagCollection(
                    stats,
                    planSet.tags(),
                    seen
                )
            }
        }

        catch (e) {
        }


        try {

            var plan =
                $CC2SetModCultures
                    .getBuildingPlan(
                        building.getPlanId()
                    )

            if (plan != null) {

                cc2setApplyTagCollection(
                    stats,
                    plan.tags(),
                    seen
                )
            }
        }

        catch (e) {
        }


        try {

            cc2setApplyTagCollection(
                stats,
                building.getRuntimeTags(),
                seen
            )
        }

        catch (e) {
        }
    }


    function cc2setComputeStats(
        manager,
        settlement
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )

        var stats =
            cc2setNewStats()

        var districtIds =
            Object.keys(
                settlement.districts
            )

        stats.district_count =
            districtIds.length


        for (
            var i = 0;
            i < districtIds.length;
            i++
        ) {

            var village =
                cc2setResolveDistrict(
                    manager,
                    districtIds[i]
                )


            if (village == null) {

                stats.missing_districts++
                continue
            }


            stats.resolved_districts++


            if (
                village.isLoneBuilding()
            ) {
                stats.lone_building_districts++
            }

            else {
                stats.village_districts++
            }


            stats.population +=
                village.getVillagerUuids()
                    .size()


            var buildings =
                village.getBuildings()

            stats.building_count +=
                buildings.size()


            for (
                var b = 0;
                b < buildings.size();
                b++
            ) {

                var building =
                    buildings.get(b)

                if (
                    building.isOperational()
                ) {
                    stats.operational_buildings++
                }

                cc2setApplyBuildingStats(
                    stats,
                    building
                )
            }
        }


        // ----------------------------------------------------
        // BASIC POPULATION-DRIVEN NEEDS
        //
        // Population creates demand automatically. Buildings
        // satisfy it through the rule table / cc2_stat_* tags.
        // ----------------------------------------------------

        stats.food_demand +=
            stats.population

        stats.housing_demand +=
            stats.population

        stats.security_demand +=
            Math.ceil(
                stats.population / 4
            )

        stats.fuel_demand +=
            Math.ceil(
                stats.population / 5
            )

        stats.logistics_demand +=
            Math.ceil(
                stats.population / 8
            )

        stats.health_demand +=
            Math.ceil(
                stats.population / 8
            )


        // Settlement-level persistent values.
        stats.treasury +=
            Number(
                settlement.values.treasury || 0
            )

        stats.commerce +=
            Number(
                settlement.values.commerce || 0
            )

        stats.prosperity +=
            Number(
                settlement.values.prosperity || 0
            )

        stats.stability +=
            Number(
                settlement.values.stability || 0
            )

        stats.trade +=
            Number(
                settlement.values.trade || 0
            )

        stats.health +=
            Number(
                settlement.values.health || 0
            )


        // ----------------------------------------------------
        // MODULAR ADDON STATS
        //
        // cc2_civic_extensions.js rebuilds settlement.addonStats
        // from user-defined rules. The core treats those values
        // exactly like native stats, including NEW stat names.
        // ----------------------------------------------------

        if (
            settlement.addonStats != null
        ) {

            var addonKeys =
                Object.keys(
                    settlement.addonStats
                )

            for (
                var a = 0;
                a < addonKeys.length;
                a++
            ) {

                cc2setAddStat(
                    stats,
                    addonKeys[a],
                    settlement.addonStats[
                        addonKeys[a]
                    ]
                )
            }
        }


        // Active settlement abilities are a separate temporary layer.
        // The ability engine rebuilds this object as effects start/expire.
        if (
            settlement.abilityStats != null
        ) {

            var abilityStatKeys =
                Object.keys(
                    settlement.abilityStats
                )

            for (
                var ab = 0;
                ab < abilityStatKeys.length;
                ab++
            ) {

                cc2setAddStat(
                    stats,
                    abilityStatKeys[ab],
                    settlement.abilityStats[
                        abilityStatKeys[ab]
                    ]
                )
            }
        }


        return stats
    }


    // ========================================================
    // SIGN RENDERING
    // ========================================================

    function cc2setBalance(
        supply,
        demand
    ) {

        return (
            Number(supply || 0) -
            Number(demand || 0)
        )
    }


    function cc2setSignedNumber(value) {

        value =
            Number(value || 0)

        if (value > 0) {
            return '+' + value
        }

        return String(value)
    }


    function cc2setSignLines(
        channel,
        settlement,
        stats,
        level,
        manager
    ) {

        switch (
            String(channel)
        ) {

            case 'overview':
                return [
                    settlement.name,
                    'Pop ' + stats.population,
                    'Districts ' + stats.district_count,
                    'Radius ' + settlement.administrativeRadius
                ]

            case 'districts':
                return [
                    'DISTRICTS',
                    'Villages ' + stats.village_districts,
                    'Lone ' + stats.lone_building_districts,
                    'Total ' + stats.district_count
                ]

            case 'population':
                return [
                    'POPULATION',
                    'People ' + stats.population,
                    'Buildings ' + stats.operational_buildings,
                    'Districts ' + stats.district_count
                ]

            case 'food':
                return [
                    'FOOD',
                    'Supply ' + stats.food_supply,
                    'Demand ' + stats.food_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.food_supply,
                            stats.food_demand
                        )
                    )
                ]

            case 'housing':
                return [
                    'HOUSING',
                    'Capacity ' + stats.housing_capacity,
                    'Demand ' + stats.housing_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.housing_capacity,
                            stats.housing_demand
                        )
                    )
                ]

            case 'security':
                return [
                    'SECURITY',
                    'Supply ' + stats.security_supply,
                    'Demand ' + stats.security_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.security_supply,
                            stats.security_demand
                        )
                    )
                ]

            case 'fuel':
                return [
                    'FUEL',
                    'Supply ' + stats.fuel_supply,
                    'Demand ' + stats.fuel_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.fuel_supply,
                            stats.fuel_demand
                        )
                    )
                ]

            case 'tools':
                return [
                    'TOOLS',
                    'Supply ' + stats.tools_supply,
                    'Demand ' + stats.tools_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.tools_supply,
                            stats.tools_demand
                        )
                    )
                ]

            case 'logistics':
                return [
                    'LOGISTICS',
                    'Capacity ' + stats.logistics_capacity,
                    'Demand ' + stats.logistics_demand,
                    'Net ' + cc2setSignedNumber(
                        cc2setBalance(
                            stats.logistics_capacity,
                            stats.logistics_demand
                        )
                    )
                ]

            case 'treasury':
                return [
                    'TREASURY',
                    String(stats.treasury),
                    'deniers',
                    ''
                ]

            case 'commerce':
                return [
                    'COMMERCE',
                    'Score ' + stats.commerce,
                    'Trade ' + stats.trade,
                    ''
                ]

            case 'prosperity':
                return [
                    'PROSPERITY',
                    'Prosperity ' + stats.prosperity,
                    'Stability ' + stats.stability,
                    ''
                ]

            case 'projects':
                return [
                    'PROJECT',
                    settlement.values.project,
                    '',
                    ''
                ]

            case 'trade':
                return [
                    'TRADE',
                    'Score ' + stats.trade,
                    'Commerce ' + stats.commerce,
                    ''
                ]

            case 'health':
                return [
                    'HEALTH',
                    'Score ' + stats.health,
                    'Population ' + stats.population,
                    ''
                ]

            case 'stock':

                var watchedItem =
                    String(
                        settlement.values.stockWatchItem || ''
                    )

                if (
                    watchedItem === ''
                ) {
                    return [
                        'STOCK WATCH',
                        'Use requisition',
                        'to select item',
                        ''
                    ]
                }

                var watchedTotal =
                    cc2setSafeStockById(
                        level,
                        manager,
                        settlement,
                        watchedItem
                    )

                return [
                    'STOCK WATCH',
                    cc2setShortItemPath(
                        watchedItem
                    ),
                    'Available ' +
                        watchedTotal,
                    'Reserved protected'
                ]


            case 'provisions':

                var grain =
                    cc2setSafeStockById(
                        level,
                        manager,
                        settlement,
                        'kubejs:grain_provisions'
                    )

                var fruit =
                    cc2setSafeStockById(
                        level,
                        manager,
                        settlement,
                        'kubejs:fruit_provisions'
                    )

                var vegetable =
                    cc2setSafeStockById(
                        level,
                        manager,
                        settlement,
                        'kubejs:vegetable_provisions'
                    )

                var protein =
                    cc2setSafeStockById(
                        level,
                        manager,
                        settlement,
                        'kubejs:protein_provisions'
                    )

                return [
                    'PROVISIONS',
                    'Gr ' + grain +
                        ' Fr ' + fruit,
                    'Veg ' + vegetable +
                        ' Pro ' + protein,
                    'Total ' +
                        (
                            grain +
                            fruit +
                            vegetable +
                            protein
                        )
                ]


            case 'transactions':

                var lastTx =
                    cc2setLastTransaction(
                        settlement
                    )

                if (
                    lastTx == null
                ) {
                    return [
                        'TRANSACTIONS',
                        'None yet',
                        '',
                        ''
                    ]
                }

                if (
                    lastTx.multiResource ===
                    true
                ) {

                    var resourceCount =
                        lastTx.resources == null
                            ? 0
                            : lastTx.resources.length

                    return [
                        'LAST TRANSACTION',
                        'Resources ' +
                            resourceCount,
                        'Sources ' +
                            lastTx.withdrawals.length,
                        String(
                            lastTx.label
                        )
                    ]
                }


                return [
                    'LAST TRANSACTION',
                    '-' + lastTx.amount +
                        ' ' +
                        cc2setShortItemPath(
                            lastTx.item
                        ),
                    'Sources ' +
                        lastTx.withdrawals.length,
                    String(
                        lastTx.label
                    )
                ]


            case 'abilities':

                var availableAbilities =
                    settlement.addonAbilities == null
                        ? []
                        : settlement.addonAbilities

                var activeAbilityState =
                    settlement.activeAbilities == null
                        ? {}
                        : settlement.activeAbilities

                var cooldownState =
                    settlement.abilityCooldowns == null
                        ? {}
                        : settlement.abilityCooldowns

                var displayNames =
                    settlement.abilityDisplayNames == null
                        ? {}
                        : settlement.abilityDisplayNames

                var gameTime =
                    Number(
                        level.getGameTime()
                    )

                var activeKeys =
                    Object.keys(
                        activeAbilityState
                    )

                var actuallyActive = []
                var cooldownCount = 0


                for (
                    var aa = 0;
                    aa < activeKeys.length;
                    aa++
                ) {

                    var activeKey =
                        activeKeys[aa]

                    var activeInfo =
                        activeAbilityState[
                            activeKey
                        ]

                    if (
                        activeInfo != null &&
                        Number(
                            activeInfo.activeUntil || 0
                        ) >
                        gameTime
                    ) {

                        actuallyActive.push(
                            activeKey
                        )
                    }
                }


                var cooldownKeys =
                    Object.keys(
                        cooldownState
                    )

                for (
                    var cd = 0;
                    cd < cooldownKeys.length;
                    cd++
                ) {

                    if (
                        Number(
                            cooldownState[
                                cooldownKeys[cd]
                            ] || 0
                        ) >
                        gameTime
                    ) {
                        cooldownCount++
                    }
                }


                var firstActive =
                    actuallyActive.length > 0
                        ? actuallyActive[0]
                        : ''

                var firstName =
                    firstActive === ''
                        ? 'None active'
                        : String(
                            displayNames[
                                firstActive
                            ] ||
                            firstActive
                        )

                var remainingText =
                    ''

                if (
                    firstActive !== ''
                ) {

                    var remainingTicks =
                        Math.max(
                            0,
                            Number(
                                activeAbilityState[
                                    firstActive
                                ].activeUntil
                            ) -
                            gameTime
                        )

                    remainingText =
                        Math.ceil(
                            remainingTicks / 20
                        ) +
                        's left'
                }

                else {

                    remainingText =
                        'Cooldowns ' +
                        cooldownCount
                }


                return [
                    'ABILITIES',
                    'Avail ' +
                        availableAbilities.length +
                        ' Active ' +
                        actuallyActive.length,
                    firstName,
                    remainingText
                ]


            case 'policy':
                return [
                    'POLICY',
                    settlement.values.policy,
                    '',
                    ''
                ]
        }


        return [
            'CIVCRAFT',
            settlement.name,
            '',
            ''
        ]
    }


    function cc2setWriteSign(
        level,
        signPos,
        lines
    ) {

        try {

            if (
                !level.isLoaded(
                    signPos
                )
            ) {
                return false
            }

            var blockEntity =
                level.getBlockEntity(
                    signPos
                )

            if (
                !(
                    blockEntity instanceof
                    $CC2SetSignBlockEntity
                )
            ) {
                return false
            }


            var text =
                new $CC2SetSignText()


            for (
                var i = 0;
                i < 4;
                i++
            ) {

                text =
                    text.setMessage(
                        i,
                        $CC2SetComponent.literal(
                            cc2setCleanSignLine(
                                lines[i]
                            )
                        )
                    )
            }


            // Write both sides so orientation never matters.
            blockEntity.setText(
                text,
                true
            )

            blockEntity.setText(
                text,
                false
            )

            blockEntity.setChanged()


            var state =
                level.getBlockState(
                    signPos
                )

            level.sendBlockUpdated(
                signPos,
                state,
                state,
                3
            )

            return true
        }

        catch (e) {

            console.error(
                CC2SET_LOG_PREFIX +
                'Sign update failed at ' +
                signPos +
                ': ' +
                e
            )

            return false
        }
    }


    function cc2setUpdateSettlementSigns(
        level,
        manager,
        settlement
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )

        var stats =
            cc2setComputeStats(
                manager,
                settlement
            )

        var channels =
            Object.keys(
                settlement.signs
            )

        for (
            var i = 0;
            i < channels.length;
            i++
        ) {

            var channel =
                channels[i]

            var binding =
                settlement.signs[
                    channel
                ]

            if (
                binding == null ||
                binding.dimension !==
                settlement.dimension
            ) {
                continue
            }

            cc2setWriteSign(
                level,
                cc2setObjectToBlockPos(
                    binding
                ),
                cc2setSignLines(
                    channel,
                    settlement,
                    stats,
                    level,
                    manager
                )
            )
        }

        return stats
    }


    function cc2setFindBoundChannelAt(
        settlement,
        dimension,
        pos
    ) {

        var channels =
            Object.keys(
                settlement.signs
            )

        for (
            var i = 0;
            i < channels.length;
            i++
        ) {

            var binding =
                settlement.signs[
                    channels[i]
                ]

            if (
                binding != null &&
                binding.dimension ===
                    dimension &&
                Number(binding.x) ===
                    pos.getX() &&
                Number(binding.y) ===
                    pos.getY() &&
                Number(binding.z) ===
                    pos.getZ()
            ) {
                return channels[i]
            }
        }

        return null
    }


    function cc2setFirstFreeSignChannel(
        settlement
    ) {

        for (
            var i = 0;
            i < CC2SET_SIGN_CHANNELS.length;
            i++
        ) {

            var channel =
                CC2SET_SIGN_CHANNELS[
                    i
                ]

            if (
                settlement.signs[
                    channel
                ] == null
            ) {
                return channel
            }
        }

        return 'overview'
    }


    function cc2setNextSignChannel(
        current
    ) {

        var index =
            CC2SET_SIGN_CHANNELS
                .indexOf(
                    String(current)
                )

        if (index < 0) {
            return CC2SET_SIGN_CHANNELS[0]
        }

        return CC2SET_SIGN_CHANNELS[
            (
                index + 1
            ) %
            CC2SET_SIGN_CHANNELS.length
        ]
    }


    function cc2setBindSign(
        server,
        db,
        settlement,
        dimension,
        pos,
        channel
    ) {

        // One physical sign should own one channel.
        var oldChannel =
            cc2setFindBoundChannelAt(
                settlement,
                dimension,
                pos
            )

        if (
            oldChannel != null
        ) {
            delete settlement.signs[
                oldChannel
            ]
        }


        settlement.signs[
            channel
        ] = {
            dimension: dimension,
            x: pos.getX(),
            y: pos.getY(),
            z: pos.getZ()
        }


        cc2setSaveDatabase(
            server,
            db
        )
    }


    // ========================================================
    // SUMMARY
    // ========================================================

    function cc2setTellSummary(
        player,
        context,
        db,
        settlement
    ) {

        settlement =
            cc2setEnsureSettlementShape(
                settlement
            )

        var stats =
            cc2setUpdateSettlementSigns(
                context.level,
                context.manager,
                settlement
            )

        var candidates =
            cc2setCountCandidates(
                context,
                db,
                settlement
            )


        player.tell(
            '§6§l' +
            settlement.name
        )

        player.tell(
            '§7Districts: §f' +
            stats.district_count +
            ' §8(' +
            stats.village_districts +
            ' villages, ' +
            stats.lone_building_districts +
            ' lone)'
        )

        player.tell(
            '§7Recorded population: §f' +
            stats.population
        )

        player.tell(
            '§7Palace administrative radius: §f' +
            settlement.administrativeRadius +
            ' blocks'
        )

        player.tell(
            '§7Unlinked candidates in radius: §f' +
            candidates.villages +
            ' villages, ' +
            candidates.loneBuildings +
            ' lone buildings'
        )


        if (
            stats.missing_districts > 0
        ) {

            player.tell(
                '§e' +
                stats.missing_districts +
                ' district(s) could not currently be resolved.'
            )
        }
    }


    // ========================================================
    // LEDGER ITEM
    // ========================================================

    ItemEvents.rightClicked(
        'kubejs:settlement_ledger',
        event => {

            var player =
                event.player

            try {

                var context =
                    cc2setGetContext(
                        player
                    )

                var db =
                    cc2setLoadDatabase(
                        player.server
                    )

                var village =
                    cc2setFindCurrentDistrict(
                        player,
                        context.manager
                    )


                // ------------------------------------------------
                // SHIFT + RIGHT CLICK:
                // Attach current Millénaire village OR lone
                // building to selected settlement.
                // ------------------------------------------------

                if (
                    player.isCrouching()
                ) {

                    var selected =
                        cc2setGetSelectedSettlement(
                            player,
                            db
                        )


                    if (selected == null) {

                        player.tell(
                            '§cNo settlement is currently selected.'
                        )

                        player.tell(
                            '§7Right-click the ledger in a Palace district first.'
                        )

                        event.cancel()
                        return
                    }


                    if (village == null) {

                        player.tell(
                            '§cNo Millénaire village or lone building was found nearby.'
                        )

                        event.cancel()
                        return
                    }


                    var linkResult =
                        cc2setLinkDistrict(
                            player,
                            context,
                            db,
                            selected,
                            village
                        )


                    if (
                        linkResult.error != null
                    ) {

                        player.tell(
                            '§c' +
                            linkResult.error
                        )

                        event.cancel()
                        return
                    }


                    if (
                        linkResult.alreadyLinked
                    ) {

                        player.tell(
                            '§eThis district is already part of §6' +
                            selected.name +
                            '§e.'
                        )

                        cc2setTellSummary(
                            player,
                            context,
                            db,
                            selected
                        )

                        event.cancel()
                        return
                    }


                    player.tell(
                        '§aDistrict linked to settlement §6' +
                        selected.name +
                        '§a!'
                    )

                    player.tell(
                        '§7Type: §f' +
                        (
                            village.isLoneBuilding()
                                ? 'Lone Building'
                                : 'Village'
                        )
                    )

                    player.tell(
                        '§7District: §f' +
                        village.getVillageName()
                    )

                    player.tell(
                        '§7Distance from Palace: §f' +
                        Math.round(
                            linkResult.distance
                        ) +
                        ' blocks'
                    )


                    cc2setTellSummary(
                        player,
                        context,
                        db,
                        selected
                    )

                    event.cancel()
                    return
                }


                // ------------------------------------------------
                // NORMAL RIGHT CLICK
                // ------------------------------------------------

                if (village == null) {

                    var selectedOutside =
                        cc2setGetSelectedSettlement(
                            player,
                            db
                        )


                    if (
                        selectedOutside != null
                    ) {

                        cc2setTellSummary(
                            player,
                            context,
                            db,
                            selectedOutside
                        )
                    }

                    else {

                        player.tell(
                            '§cNo Millénaire district was found nearby.'
                        )
                    }

                    event.cancel()
                    return
                }


                var villageUuid =
                    cc2setVillageUUID(
                        village
                    )

                var existingSettlement =
                    cc2setFindSettlementForDistrict(
                        db,
                        villageUuid
                    )


                if (
                    existingSettlement != null
                ) {

                    cc2setSelectSettlement(
                        player,
                        existingSettlement
                    )

                    player.tell(
                        '§aSelected settlement §6' +
                        existingSettlement.name +
                        '§a.'
                    )

                    player.tell(
                        '§7Current district: §f' +
                        village.getVillageName()
                    )

                    cc2setTellSummary(
                        player,
                        context,
                        db,
                        existingSettlement
                    )

                    event.cancel()
                    return
                }


                var palace =
                    cc2setFindPalace(
                        village
                    )


                if (palace == null) {

                    var selectedForHint =
                        cc2setGetSelectedSettlement(
                            player,
                            db
                        )

                    player.tell(
                        '§eThis district does not belong to a settlement yet.'
                    )

                    player.tell(
                        '§7District: §f' +
                        village.getVillageName()
                    )


                    if (
                        selectedForHint != null
                    ) {

                        var distance =
                            cc2setDistrictDistanceFromPalace(
                                selectedForHint,
                                village
                            )

                        player.tell(
                            '§7Distance from selected Palace: §f' +
                            Math.round(distance) +
                            ' / ' +
                            selectedForHint.administrativeRadius
                        )

                        if (
                            distance <=
                            selectedForHint.administrativeRadius
                        ) {

                            player.tell(
                                '§7Shift + right-click to attach this district.'
                            )
                        }

                        else {

                            player.tell(
                                '§cThis district lies outside the Palace administrative radius.'
                            )
                        }
                    }

                    else {

                        player.tell(
                            '§7Create/select a settlement at a Palace first.'
                        )
                    }

                    event.cancel()
                    return
                }


                var palaceResult =
                    cc2setCreateOrGetPalaceSettlement(
                        player,
                        context,
                        db,
                        village,
                        palace
                    )


                if (
                    palaceResult.error != null
                ) {

                    player.tell(
                        '§c' +
                        palaceResult.error
                    )

                    event.cancel()
                    return
                }


                if (
                    palaceResult.created
                ) {

                    player.tell(
                        '§6§lA new settlement has been established!'
                    )

                    player.tell(
                        '§7Palace district: §f' +
                        village.getVillageName()
                    )

                    player.tell(
                        '§7Administrative radius: §f' +
                        palaceResult.settlement.administrativeRadius +
                        ' blocks'
                    )
                }

                else {

                    player.tell(
                        '§aSettlement selected.'
                    )
                }


                cc2setTellSummary(
                    player,
                    context,
                    db,
                    palaceResult.settlement
                )

                event.cancel()
            }

            catch (e) {

                var errorText =
                    String(e)

                if (
                    errorText.indexOf(
                        'dev.latvian.mods.kubejs.event.EventExit'
                    ) >= 0
                ) {
                    return
                }

                player.tell(
                    '§c[Settlement Ledger] SCRIPT ERROR:'
                )

                player.tell(
                    '§c' + e
                )

                console.error(
                    CC2SET_LOG_PREFIX +
                    e
                )
            }
        }
    )



    // ========================================================
    // SETTLEMENT REQUISITION
    //
    // OFFHAND ITEM = requested resource template
    // OFFHAND STACK COUNT = requested quantity
    //
    // normal right-click:
    //   safe stock audit only
    //
    // shift + right-click:
    //   atomically withdraw requested amount from the selected
    //   settlement's real Millenaire building inventories
    //   and deliver it to the player.
    // ========================================================

    ItemEvents.rightClicked(
        'kubejs:settlement_requisition',
        event => {

            var player =
                event.player

            console.info(
                CC2SET_LOG_PREFIX +
                'Settlement Requisition item-use event fired for ' +
                player.name.string
            )

            try {

                var context =
                    cc2setGetContext(
                        player
                    )

                var db =
                    cc2setLoadDatabase(
                        player.server
                    )

                var settlement =
                    cc2setGetSelectedSettlement(
                        player,
                        db
                    )


                if (
                    settlement == null
                ) {

                    player.tell(
                        '§cNo settlement selected.'
                    )

                    player.tell(
                        '§7Select one with the Settlement Ledger first.'
                    )

                    event.cancel()
                    return
                }


                var sample =
                    player.getOffhandItem()


                if (
                    sample == null ||
                    sample.isEmpty()
                ) {

                    player.tell(
                        '§cPut the item you want to requisition in your off hand.'
                    )

                    event.cancel()
                    return
                }


                var item =
                    sample.getItem()

                var itemId =
                    cc2setItemId(
                        item
                    )

                var requested =
                    Math.max(
                        1,
                        Number(
                            sample.getCount()
                        )
                    )


                // Make this item the Palace STOCK-watch resource.
                settlement.values.stockWatchItem =
                    itemId

                cc2setSaveDatabase(
                    player.server,
                    db
                )


                var audit =
                    cc2setAuditExactItem(
                        context.level,
                        context.manager,
                        settlement,
                        item
                    )


                if (
                    !player.isCrouching()
                ) {

                    player.tell(
                        '§6§lSettlement Stock Audit'
                    )

                    player.tell(
                        '§7Settlement: §f' +
                        settlement.name
                    )

                    player.tell(
                        '§7Item: §f' +
                        itemId
                    )

                    player.tell(
                        '§7Safely available: §a' +
                        audit.total
                    )

                    player.tell(
                        '§7Requested by off-hand stack: §f' +
                        requested
                    )


                    var districtKeys =
                        Object.keys(
                            audit.districtTotals
                        )

                    districtKeys.sort(
                        function(a, b) {

                            return (
                                audit.districtTotals[b].available -
                                audit.districtTotals[a].available
                            )
                        }
                    )


                    for (
                        var i = 0;
                        i < districtKeys.length;
                        i++
                    ) {

                        var district =
                            audit.districtTotals[
                                districtKeys[i]
                            ]

                        player.tell(
                            '§8- §f' +
                            district.districtName +
                            ' §7(' +
                            (
                                district.districtKind ===
                                'lone_building'
                                    ? 'lone'
                                    : 'village'
                            ) +
                            '): §a' +
                            district.available
                        )
                    }


                    player.tell(
                        '§8Millénaire reserved stock is excluded.'
                    )


                    cc2setUpdateSettlementSigns(
                        context.level,
                        context.manager,
                        settlement
                    )

                    event.cancel()
                    return
                }


                var result =
                    cc2setPerformExactItemTransaction(
                        player.server,
                        db,
                        context.level,
                        context.manager,
                        settlement,
                        item,
                        requested,
                        'Player Requisition',
                        player.name.string
                    )


                if (
                    !result.success
                ) {

                    player.tell(
                        '§cRequisition denied.'
                    )

                    player.tell(
                        '§7Requested: §f' +
                        result.requested
                    )

                    player.tell(
                        '§7Safely available: §f' +
                        result.available
                    )

                    if (
                        result.missing != null
                    ) {

                        player.tell(
                            '§7Missing: §c' +
                            result.missing
                        )
                    }

                    player.tell(
                        '§7No settlement inventory was consumed.'
                    )

                    event.cancel()
                    return
                }


                // Deliver the withdrawn physical items to the player.
                var delivered =
                    new $CC2SetItemStack(
                        result.item,
                        result.amount
                    )


                // Player.addItem() mutates the stack with leftovers.
                player.addItem(
                    delivered
                )


                if (
                    !delivered.isEmpty()
                ) {

                    // Inventory full: drop any remainder rather than
                    // deleting goods already withdrawn from settlement.
                    player.drop(
                        delivered,
                        false
                    )
                }


                player.tell(
                    '§aSettlement requisition completed!'
                )

                player.tell(
                    '§7Item: §f' +
                    result.itemId
                )

                player.tell(
                    '§7Amount: §f' +
                    result.amount
                )

                player.tell(
                    '§7Source inventories used: §f' +
                    result.withdrawals.length
                )


                // Consolidated district accounting in chat.
                var byDistrict = {}

                for (
                    var w = 0;
                    w < result.withdrawals.length;
                    w++
                ) {

                    var withdrawal =
                        result.withdrawals[w]

                    if (
                        byDistrict[
                            withdrawal.villageUuid
                        ] == null
                    ) {

                        byDistrict[
                            withdrawal.villageUuid
                        ] = {
                            name:
                                withdrawal.districtName,

                            kind:
                                withdrawal.districtKind,

                            amount:
                                0
                        }
                    }

                    byDistrict[
                        withdrawal.villageUuid
                    ].amount +=
                        withdrawal.amount
                }


                var districtIds =
                    Object.keys(
                        byDistrict
                    )

                for (
                    var d = 0;
                    d < districtIds.length;
                    d++
                ) {

                    var sourceDistrict =
                        byDistrict[
                            districtIds[d]
                        ]

                    player.tell(
                        '§8- §f' +
                        sourceDistrict.name +
                        ': §c-' +
                        sourceDistrict.amount
                    )
                }


                cc2setUpdateSettlementSigns(
                    context.level,
                    context.manager,
                    settlement
                )

                event.cancel()
            }

            catch (e) {

                var errorText =
                    String(e)

                if (
                    errorText.indexOf(
                        'dev.latvian.mods.kubejs.event.EventExit'
                    ) >= 0
                ) {
                    return
                }

                player.tell(
                    '§c[Settlement Requisition] SCRIPT ERROR:'
                )

                player.tell(
                    '§c' + e
                )

                console.error(
                    CC2SET_LOG_PREFIX +
                    'Requisition error: ' +
                    e
                )
            }
        }
    )



    // ========================================================
    // MULTI-PALACE LOCAL SIGN RESOLUTION
    //
    // v0.4 bound Palace signs to the player's selected settlement.
    // That made multiple Palaces awkward: configuring Palace B
    // could still point at Palace A.
    //
    // v0.5 makes LOCATION authoritative for Palace signs.
    // The closest registered Palace within the Palace sign radius
    // owns the sign. Player selection is only a fallback.
    // ========================================================

    function cc2setFindSettlementForPalacePosition(
        db,
        level,
        pos
    ) {

        var dimension =
            cc2setDimensionId(
                level
            )

        var ids =
            Object.keys(
                db.settlements
            )

        var best = null
        var bestDistance =
            Number.MAX_VALUE


        for (
            var i = 0;
            i < ids.length;
            i++
        ) {

            var settlement =
                cc2setEnsureSettlementShape(
                    db.settlements[
                        ids[i]
                    ]
                )


            if (
                settlement.dimension !==
                dimension ||
                settlement.palace == null ||
                settlement.palace.origin == null
            ) {
                continue
            }


            var palacePos =
                cc2setObjectToBlockPos(
                    settlement.palace.origin
                )

            var distance =
                cc2setDistanceXZPos(
                    palacePos,
                    pos
                )


            if (
                distance <=
                    CC2SET_PALACE_SIGN_BIND_RADIUS &&
                distance <
                    bestDistance
            ) {

                best =
                    settlement

                bestDistance =
                    distance
            }
        }


        return best
    }


    // ========================================================
    // PALACE SIGN BINDING
    //
    // RIGHT-CLICK a vanilla sign with Settlement Ledger:
    //   bind first free page
    //
    // SHIFT + RIGHT-CLICK a BOUND sign:
    //   cycle its page
    // ========================================================

    BlockEvents.rightClicked(
        event => {

            if (
                String(
                    event.item.id
                ) !==
                'kubejs:settlement_ledger'
            ) {
                return
            }


            if (
                !cc2setIsSignBlockId(
                    event.block.id
                )
            ) {
                return
            }


            var player =
                event.player

            try {

                var context =
                    cc2setGetContext(
                        player
                    )

                var db =
                    cc2setLoadDatabase(
                        player.server
                    )

                var signPos =
                    new $CC2SetBlockPos(
                        event.block.x,
                        event.block.y,
                        event.block.z
                    )

                var settlement =
                    cc2setFindSettlementForPalacePosition(
                        db,
                        context.level,
                        signPos
                    )


                // Selection is now only a fallback for an unfinished
                // Palace whose anchor is registered but sign location
                // cannot yet be resolved locally.
                if (settlement == null) {

                    settlement =
                        cc2setGetSelectedSettlement(
                            player,
                            db
                        )
                }


                if (settlement == null) {

                    player.tell(
                        '§cNo Palace settlement could be resolved for this sign.'
                    )

                    event.cancel()
                    return
                }


                // Make the locally resolved Palace current for later
                // district-linking actions, but do not depend on this
                // selection for sign ownership.
                cc2setSelectSettlement(
                    player,
                    settlement
                )


                if (
                    settlement.dimension !==
                    cc2setDimensionId(
                        context.level
                    )
                ) {

                    player.tell(
                        '§cThis sign is not in the Palace settlement dimension.'
                    )

                    event.cancel()
                    return
                }


                var pos =
                    signPos


                var palacePos =
                    cc2setObjectToBlockPos(
                        settlement.palace.origin
                    )

                var palaceDistance =
                    cc2setDistanceXZPos(
                        palacePos,
                        pos
                    )


                if (
                    palaceDistance >
                    CC2SET_PALACE_SIGN_BIND_RADIUS
                ) {

                    player.tell(
                        '§cPalace ledger signs must be within ' +
                        CC2SET_PALACE_SIGN_BIND_RADIUS +
                        ' blocks of the Palace.'
                    )

                    event.cancel()
                    return
                }


                var oldChannel =
                    cc2setFindBoundChannelAt(
                        settlement,
                        settlement.dimension,
                        pos
                    )


                var channel

                if (
                    oldChannel != null &&
                    player.isCrouching()
                ) {

                    channel =
                        cc2setNextSignChannel(
                            oldChannel
                        )
                }

                else if (
                    oldChannel != null
                ) {

                    channel =
                        oldChannel
                }

                else {

                    channel =
                        cc2setFirstFreeSignChannel(
                            settlement
                        )
                }


                cc2setBindSign(
                    player.server,
                    db,
                    settlement,
                    settlement.dimension,
                    pos,
                    channel
                )


                var stats =
                    cc2setComputeStats(
                        context.manager,
                        settlement
                    )


                cc2setWriteSign(
                    context.level,
                    pos,
                    cc2setSignLines(
                        channel,
                        settlement,
                        stats,
                        context.level,
                        context.manager
                    )
                )


                player.tell(
                    '§aPalace sign bound: §6' +
                    channel.toUpperCase()
                )

                if (
                    oldChannel != null &&
                    player.isCrouching()
                ) {

                    player.tell(
                        '§7Shift + right-click again to cycle to the next page.'
                    )
                }

                event.cancel()
            }

            catch (e) {

                var errorText =
                    String(e)

                if (
                    errorText.indexOf(
                        'dev.latvian.mods.kubejs.event.EventExit'
                    ) >= 0
                ) {
                    return
                }

                player.tell(
                    '§c[Settlement Sign] SCRIPT ERROR: §f' +
                    e
                )

                console.error(
                    CC2SET_LOG_PREFIX +
                    'Settlement sign binding error: ' +
                    e
                )
            }
        }
    )


    // ========================================================
    // PERIODIC SIGN REFRESH
    // ========================================================

    ServerEvents.tick(
        event => {

            CC2SET_TICK_COUNTER++

            if (
                CC2SET_TICK_COUNTER <
                CC2SET_SIGN_REFRESH_TICKS
            ) {
                return
            }

            CC2SET_TICK_COUNTER = 0


            try {

                var db =
                    cc2setLoadDatabase(
                        event.server
                    )

                var ids =
                    Object.keys(
                        db.settlements
                    )


                for (
                    var i = 0;
                    i < ids.length;
                    i++
                ) {

                    var settlement =
                        cc2setEnsureSettlementShape(
                            db.settlements[
                                ids[i]
                            ]
                        )


                    if (
                        Object.keys(
                            settlement.signs
                        ).length === 0
                    ) {
                        continue
                    }


                    var level =
                        cc2setResolveLevel(
                            event.server,
                            settlement.dimension
                        )


                    if (level == null) {
                        continue
                    }


                    var savedData =
                        $CC2SetVillageSavedData.get(
                            level
                        )


                    cc2setUpdateSettlementSigns(
                        level,
                        savedData.getVillageManager(),
                        settlement
                    )
                }
            }

            catch (e) {

                console.error(
                    CC2SET_LOG_PREFIX +
                    'Periodic sign refresh failed: ' +
                    e
                )
            }
        }
    )


    // ========================================================
    // FUTURE MODULE API
    //
    // v0.3 originally exported helpers through:
    //
    //   global.CC2SettlementAPI = ...
    //
    // KubeJS rejects assignment to `global` in server/client
    // scripts, so that export has intentionally been removed.
    //
    // When we split needs/economy modules out later, we will
    // use a KubeJS-supported shared-data mechanism instead.
    // The settlement core itself does not require that API.
    // ========================================================


    console.info(
        CC2SET_LOG_PREFIX +
        'Settlement System v0.6 ABILITIES loaded. Palace district radius=' +
        CC2SET_PALACE_DISTRICT_RADIUS +
        ', sign bind radius=' +
        CC2SET_PALACE_SIGN_BIND_RADIUS +
        '.'
    )

})()
