// ============================================================================
// CIVCRAFT 2 - MILLENAIRE CARPET MARKERS -> MCA + EASY NPC
// Minecraft 1.21.1 / NeoForge
//
// PURPOSE
// -------
// Reads carpet blocks ONLY at exact positions defined by operational
// Millenaire building templates. A player-placed carpet elsewhere is ignored.
//
// Each carpet color maps to a ROLE. Data rules then decide whether that role
// should spawn:
//   - an MCA villager, or
//   - an Easy NPC preset.
//
// IMPORTANT DESIGN RULE:
// The carpet is removed ONLY AFTER a backend reports a successful spawn.
// A missing mod, missing Easy NPC preset, or Java/API exception leaves the
// carpet intact for a later retry.
//
// This remains intentionally ONE-SHOT. v6 only optimizes discovery/retry work.
// It spawns the NPC once and remembers that template slot as processed.
// Respawning/guard replacement can still be added later after both backends
// have proven stable in your actual pack.
//
// Put this file in:
//   kubejs/server_scripts/
//
// Do not run older experimental CC2 NPC carpet bridge scripts at the same time.
// ============================================================================

console.info('[CC2 Dual NPC Markers v6 OPTIMIZED] SCRIPT LOADED')


// ============================================================================
// CORE SETTINGS
// ============================================================================

var CC2DUAL_STATE_VERSION = 'dual3'
// A lightweight discovery pass still has to notice new/upgraded Millenaire
// buildings, but expensive template compilation is now cached and queued.
var CC2DUAL_FIRST_DISCOVERY_TICK = 100
var CC2DUAL_DISCOVERY_INTERVAL_TICKS = 200

// Work is spread across ticks instead of processing every unfinished building
// in one giant scan.
var CC2DUAL_WORK_INTERVAL_TICKS = 20
var CC2DUAL_MAX_BUILDINGS_PER_WORK_CYCLE = 2

// Failed/pending buildings retry progressively less often:
// 5 sec -> 15 sec -> 30 sec -> 60 sec.
var CC2DUAL_RETRY_BACKOFF_TICKS = [
    100,
    300,
    600,
    1200
]

// DEBUG=false avoids periodic scan spam. Successes and first-time warnings
// are still logged.
var CC2DUAL_DEBUG = false

// If true, a successful NPC spawn consumes the carpet marker.
var CC2DUAL_REMOVE_MARKER_AFTER_SUCCESS = true


// ============================================================================
// CARPET COLOR -> ROLE
// ============================================================================
//
// If you want an actual colored floor in a Millenaire building, use WOOL.
// Carpet is reserved as invisible build-time metadata.
//
var CC2DUAL_MARKER_ROLES = {
    'minecraft:white_carpet':      'ambient',
    'minecraft:orange_carpet':     'tavern_patron',
    'minecraft:magenta_carpet':    'traveler',
    'minecraft:light_blue_carpet': 'resident',
    'minecraft:yellow_carpet':     'merchant',
    'minecraft:lime_carpet':       'worker',
    'minecraft:pink_carpet':       'social',
    'minecraft:gray_carpet':       'guard',
    'minecraft:light_gray_carpet': 'sentry',
    'minecraft:cyan_carpet':       'specialist',
    'minecraft:purple_carpet':     'entertainer',
    'minecraft:blue_carpet':       'official',
    'minecraft:brown_carpet':      'laborer',
    'minecraft:green_carpet':      'farmer',
    'minecraft:red_carpet':        'soldier',
    'minecraft:black_carpet':      'special'
}


// ============================================================================
// ROLE DEFAULTS
// ============================================================================
//
// SOCIAL / ORDINARY LIFE roles default to MCA because MCA can generate a
// proper MCA citizen with its own normal name/gender/age behavior.
//
// Scripted/specialized roles intentionally have NO backend by default.
// Configure those as Easy NPC presets in culture/village/building rules.
//
// Any rule may use:
//
//   backend: 'mca'
//   gender: 'random' | 'male' | 'female'
//   name: 'Exact Name'
//   names: ['Name A', 'Name B']
//   age: 0                       // optional; omitted = MCA's own normal choice
//
// or:
//
//   backend: 'easy_npc'
//   preset: 'namespace:preset_id'
//   presets: ['namespace:a', 'namespace:b']
//
// common fields:
//
//   enabled: true
//   removeMarker: true
//   offsetX: 0
//   offsetY: 0
//   offsetZ: 0
//
var CC2DUAL_ROLE_DEFAULTS = {
    ambient:       { backend: 'mca', gender: 'random' },
    tavern_patron: { backend: 'mca', gender: 'random' },
    traveler:      { backend: 'mca', gender: 'random' },
    resident:      { backend: 'mca', gender: 'random' },

    merchant:      { backend: null },

    worker:        { backend: 'mca', gender: 'random' },
    social:        { backend: 'mca', gender: 'random' },

    guard:         { backend: null },
    sentry:        { backend: null },
    specialist:    { backend: null },
    entertainer:   { backend: null },
    official:      { backend: null },

    laborer:       { backend: 'mca', gender: 'random' },
    farmer:        { backend: 'mca', gender: 'random' },

    soldier:       { backend: null },
    special:       { backend: null }
}


// ============================================================================
// DATA-DRIVEN OVERRIDES
// ============================================================================
//
// Resolution order:
//   role default
//   -> culture
//   -> village type
//   -> building
//   -> exact culture + village type + building
//   -> exact generated village UUID
//
// IMPORTANT:
// These are deliberately plain, complete objects.
// Do not delete their declarations even when you are not using a layer.
// ============================================================================


// Norman culture override.
// Gray carpet = guard.
// Norman guards use your Easy NPC CUSTOM preset from:
// config/easy_npc/preset/humanoid/normanguard.npc.nbt
var CC2DUAL_CULTURE_RULES = {
    'millenaire:civnormans': {
        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanguard.npc.nbt'
        },
		
		sentry: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normansentry.npc.nbt'
        }
    }
}

// ============================================================================
// VILLAGE-TYPE OVERRIDES
// Applies to EVERY building in this type of village.
// ============================================================================

var CC2DUAL_VILLAGE_RULES = {

    // Example:
    // Every yellow-carpet MERCHANT anywhere in the Survival Village
    // becomes this Easy NPC merchant.
    'millenaire:civnormans/survivalvillage': {

        merchant: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanmerchant.npc.nbt'
        },

        // Purple carpet in this village = Norman musician/bard
        entertainer: {
            backend: 'easy_npc',
            presetType: 'custom',
            presets: [
                'easy_npc:preset/humanoid/normanbard.npc.nbt',
                'easy_npc:preset/humanoid/normanmusician.npc.nbt'
            ]
        },

        // Blue carpet = village official
        official: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normansteward.npc.nbt'
        }
    },


    // Another village type can have completely different behavior.
    'millenaire:civnormans/militaryvillage': {

        // Red carpet = soldier
        soldier: {
            backend: 'easy_npc',
            presetType: 'custom',
            presets: [
                'easy_npc:preset/humanoid/normansoldier_1.npc.nbt',
                'easy_npc:preset/humanoid/normansoldier_2.npc.nbt',
                'easy_npc:preset/humanoid/normansoldier_3.npc.nbt'
            ]
        },

        // Gray carpet = heavier military guard
        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanmanguard.npc.nbt'
        }
    }
}


// ============================================================================
// BUILDING OVERRIDES
// Applies whenever this exact BUILDING PLAN SET appears,
// regardless of which village type contains it.
// ============================================================================

var CC2DUAL_BUILDING_RULES = {

    // The kiln gets a named MCA worker from its lime carpet.
    'millenaire:civnormans/kiln': {

        worker: {
            backend: 'mca',
            gender: 'male',
            names: [
                'Robert',
                'William',
                'Thomas',
                'Hugh'
            ]
        },

        // Cyan carpet = specialist potter/smelter NPC
        specialist: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normankilnworker.npc.nbt'
        }
    },


    // Tavern-specific people
    'millenaire:civnormans/tavern': {

        // Orange carpets normally already use MCA,
        // but here we can control the possible names.
        tavern_patron: {
            backend: 'mca',
            gender: 'random',
            names: [
                'Edwin',
                'Matilda',
                'Alice',
                'Geoffrey',
                'Emma'
            ]
        },

        // Yellow carpet = scripted innkeeper
        merchant: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normaninnkeeper.npc.nbt'
        },

        // Purple carpet = bard
        entertainer: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanbard.npc.nbt'
        }
    },


    // A church/chapel
    'millenaire:civnormans/chapel': {

        // Black carpet = unique scripted role
        special: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanpriest.npc.nbt'
        },

        // Light-blue carpet = ordinary resident
        resident: {
            backend: 'mca',
            gender: 'random'
        }
    },


    // Guard tower
    'millenaire:civnormans/guardtower': {

        // Gray
        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanguard.npc.nbt'
        },

        // Light gray
        sentry: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normansentry.npc.nbt'
        },

        // Red
        soldier: {
            backend: 'easy_npc',
            presetType: 'custom',
            presets: [
                'easy_npc:preset/humanoid/normansoldier_1.npc.nbt',
                'easy_npc:preset/humanoid/normansoldier_2.npc.nbt'
            ]
        }
    }
}


// ============================================================================
// EXACT CULTURE + VILLAGE TYPE + BUILDING OVERRIDES
//
// This lets the SAME building act differently depending on what village
// it belongs to.
//
// Key:
// culture||villageType||building
// ============================================================================

var CC2DUAL_EXACT_RULES = {

    // A well in the Survival Village gets an ordinary guard.
    'millenaire:civnormans||millenaire:civnormans/survivalvillage||millenaire:civnormans/well': {

        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanguard.npc.nbt'
        }
    },


    // But the SAME well building in a military settlement could get
    // an armored soldier instead.
    'millenaire:civnormans||millenaire:civnormans/militaryvillage||millenaire:civnormans/well': {

        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normaneliteguard.npc.nbt'
        }
    },


    // A town hovel specifically inside the Survival Village.
    'millenaire:civnormans||millenaire:civnormans/survivalvillage||millenaire:civnormans/town_hovel': {

        // Light blue carpet
        resident: {
            backend: 'mca',
            gender: 'random'
        },

        // Lime carpet
        worker: {
            backend: 'mca',
            gender: 'random',
            names: [
                'Henry',
                'Richard',
                'Joan',
                'Margaret'
            ]
        }
    },


    // Meeting spot: steward is scripted, residents remain MCA.
    'millenaire:civnormans||millenaire:civnormans/survivalvillage||millenaire:civnormans/meetingspot': {

        official: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normansteward.npc.nbt'
        },

        resident: {
            backend: 'mca',
            gender: 'random'
        },

        guard: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/normanguard.npc.nbt'
        }
    }
}


// ============================================================================
// EXACT GENERATED-VILLAGE UUID OVERRIDES
//
// HIGHEST PRIORITY.
//
// This affects ONE ACTUAL GENERATED VILLAGE in the world.
// Replace the UUID below with the UUID shown in your CC2 log.
// ============================================================================

var CC2DUAL_VILLAGE_INSTANCE_RULES = {

    '12345678-1234-1234-1234-123456789abc': {

        // Every blue carpet in THIS ONE village gets a special governor.
        official: {
            backend: 'easy_npc',
            presetType: 'custom',
            preset: 'easy_npc:preset/humanoid/sir_jeffrey_governor.npc.nbt'
        },

        // Every red carpet in this settlement gets elite troops.
        soldier: {
            backend: 'easy_npc',
            presetType: 'custom',
            presets: [
                'easy_npc:preset/humanoid/normanveteran_1.npc.nbt',
                'easy_npc:preset/humanoid/normanveteran_2.npc.nbt'
            ]
        },

        // Make MCA residents female in only this particular village.
        resident: {
            backend: 'mca',
            gender: 'female'
        }
    }
}


// ============================================================================
// MILLENAIRE / MINECRAFT JAVA CLASSES
// ============================================================================
//
// Deliberately obnoxious names avoid Rhino top-level variable collisions with
// your other KubeJS scripts.
//

var $CC2DUAL_VillageSavedData =
    Java.loadClass('org.millenaire.village.VillageSavedData')

var $CC2DUAL_ModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

var $CC2DUAL_BuildingPlacer =
    Java.loadClass('org.millenaire.world.BuildingPlacer')

var $CC2DUAL_BuiltInRegistries =
    Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

var $CC2DUAL_Blocks =
    Java.loadClass('net.minecraft.world.level.block.Blocks')

var $CC2DUAL_Vec3 =
    Java.loadClass('net.minecraft.world.phys.Vec3')

var $CC2DUAL_ResourceLocation =
    Java.loadClass('net.minecraft.resources.ResourceLocation')

var $CC2DUAL_MobSpawnType =
    Java.loadClass('net.minecraft.world.entity.MobSpawnType')


// ============================================================================
// LAZY BACKEND CLASS LOADING
// ============================================================================
//
// Lazy loading is intentional:
// - MCA can be absent without making the whole marker scanner fail to load.
// - Easy NPC can be added later.
// - A missing backend only affects markers configured for that backend.
//

var CC2DUAL_mcaLoadAttempted = false
var CC2DUAL_mcaFactoryClass = null
var CC2DUAL_mcaGenderClass = null
var CC2DUAL_mcaLoadError = null

var CC2DUAL_easyLoadAttempted = false
var CC2DUAL_easyHandlerClass = null
var CC2DUAL_easyPresetTypeClass = null
var CC2DUAL_easyLoadError = null


function CC2DUAL_loadMCA() {

    if (CC2DUAL_mcaLoadAttempted) {
        return CC2DUAL_mcaFactoryClass != null
    }

    CC2DUAL_mcaLoadAttempted = true

    try {

        CC2DUAL_mcaFactoryClass =
            Java.loadClass('net.conczin.mca.entity.VillagerFactory')

        CC2DUAL_mcaGenderClass =
            Java.loadClass('net.conczin.mca.entity.ai.relationship.Gender')

        console.info('[CC2 Dual NPC Markers] MCA backend available')

        return true
    }

    catch (error) {

        CC2DUAL_mcaLoadError = String(error)

        console.warn(
            '[CC2 Dual NPC Markers] MCA backend unavailable: ' +
            CC2DUAL_mcaLoadError
        )

        return false
    }
}


function CC2DUAL_loadEasyNPC() {

    if (CC2DUAL_easyLoadAttempted) {
        return CC2DUAL_easyHandlerClass != null
    }

    CC2DUAL_easyLoadAttempted = true

    try {

        CC2DUAL_easyHandlerClass =
            Java.loadClass(
                'de.markusbordihn.easynpc.api.handler.EasyNPCEntityHandler'
            )

        CC2DUAL_easyPresetTypeClass =
            Java.loadClass(
                'de.markusbordihn.easynpc.data.preset.PresetType'
            )

        console.info(
            '[CC2 Dual NPC Markers] Easy NPC backend available'
        )

        return true
    }

    catch (error) {

        CC2DUAL_easyLoadError = String(error)

        console.warn(
            '[CC2 Dual NPC Markers] Easy NPC backend unavailable: ' +
            CC2DUAL_easyLoadError
        )

        return false
    }
}


// ============================================================================
// GENERAL HELPERS
// ============================================================================

var CC2DUAL_serverTick = 0
var CC2DUAL_warned = {}

// Runtime-only scheduler/cache. Persistent one-shot state remains in
// server.persistentData exactly as before, so this does NOT respawn old NPCs.
var CC2DUAL_runtimeBuildings = {}
var CC2DUAL_workQueue = []
var CC2DUAL_workQueueHead = 0


function CC2DUAL_safeKey(value) {

    return String(value)
        .replace(/[^A-Za-z0-9_]/g, '_')
}


function CC2DUAL_copyObject(source) {

    var result = {}

    if (source == null) {
        return result
    }

    for (var key in source) {
        result[key] = source[key]
    }

    return result
}


function CC2DUAL_mergeObject(target, source) {

    if (source == null) {
        return
    }

    for (var key in source) {

        if (
            (key == 'names' || key == 'presets') &&
            source[key] != null
        ) {

            target[key] = []

            for (var i = 0; i < source[key].length; i++) {
                target[key].push(String(source[key][i]))
            }
        }

        else {
            target[key] = source[key]
        }
    }
}


function CC2DUAL_getRoleRule(map, id, role) {

    if (map == null || id == null) {
        return null
    }

    var group = map[String(id)]

    if (group == null) {
        return null
    }

    return group[role]
}


function CC2DUAL_getVillageUUID(village) {

    try {
        return String(village.getId().uuid())
    }

    catch (error1) {

        try {
            return String(village.getId().uuid)
        }

        catch (error2) {
            return String(village.getId())
        }
    }
}


function CC2DUAL_chooseString(singleValue, arrayValue) {

    if (
        arrayValue != null &&
        arrayValue.length > 0
    ) {

        return String(
            arrayValue[
                Math.floor(
                    Math.random() *
                    arrayValue.length
                )
            ]
        )
    }

    if (
        singleValue != null &&
        String(singleValue).length > 0
    ) {
        return String(singleValue)
    }

    return null
}


// ============================================================================
// RULE RESOLUTION
// ============================================================================

function CC2DUAL_resolveSpec(village, building, role) {

    var cultureId =
        String(village.getCultureId())

    var villageTypeId =
        String(village.getVillageTypeId())

    var buildingId =
        String(building.getPlanSetId())

    var villageUUID =
        CC2DUAL_getVillageUUID(village)

    var exactKey =
        cultureId +
        '||' +
        villageTypeId +
        '||' +
        buildingId

    var spec =
        CC2DUAL_copyObject(
            CC2DUAL_ROLE_DEFAULTS[role]
        )

    CC2DUAL_mergeObject(
        spec,
        CC2DUAL_getRoleRule(
            CC2DUAL_CULTURE_RULES,
            cultureId,
            role
        )
    )

    CC2DUAL_mergeObject(
        spec,
        CC2DUAL_getRoleRule(
            CC2DUAL_VILLAGE_RULES,
            villageTypeId,
            role
        )
    )

    CC2DUAL_mergeObject(
        spec,
        CC2DUAL_getRoleRule(
            CC2DUAL_BUILDING_RULES,
            buildingId,
            role
        )
    )

    CC2DUAL_mergeObject(
        spec,
        CC2DUAL_getRoleRule(
            CC2DUAL_EXACT_RULES,
            exactKey,
            role
        )
    )

    CC2DUAL_mergeObject(
        spec,
        CC2DUAL_getRoleRule(
            CC2DUAL_VILLAGE_INSTANCE_RULES,
            villageUUID,
            role
        )
    )

    if (spec.enabled == null) {
        spec.enabled = true
    }

    if (spec.removeMarker == null) {
        spec.removeMarker =
            CC2DUAL_REMOVE_MARKER_AFTER_SUCCESS
    }

    if (spec.offsetX == null) spec.offsetX = 0
    if (spec.offsetY == null) spec.offsetY = 0
    if (spec.offsetZ == null) spec.offsetZ = 0

    spec.role = role
    spec.cultureId = cultureId
    spec.villageTypeId = villageTypeId
    spec.buildingId = buildingId
    spec.villageUUID = villageUUID

    return spec
}


// ============================================================================
// PERSISTENT SLOT KEYS
// ============================================================================

function CC2DUAL_slotBase(
    level,
    village,
    building,
    planLevel,
    relativePos,
    role
) {

    var origin =
        building.getOrigin()

    return (
        'cc2dual_' +
        CC2DUAL_STATE_VERSION + '_' +
        CC2DUAL_safeKey(String(level.dimension)) + '_' +
        CC2DUAL_safeKey(CC2DUAL_getVillageUUID(village)) + '_' +
        CC2DUAL_safeKey(String(building.getPlanSetId())) + '_' +
        origin.getX() + '_' +
        origin.getY() + '_' +
        origin.getZ() + '_' +
        CC2DUAL_safeKey(String(building.getVariant())) + '_' +
        planLevel + '_' +
        relativePos.getX() + '_' +
        relativePos.getY() + '_' +
        relativePos.getZ() + '_' +
        CC2DUAL_safeKey(role)
    )
}


function CC2DUAL_buildingDoneKey(
    level,
    village,
    building
) {

    var origin =
        building.getOrigin()

    return (
        'cc2dual_' +
        CC2DUAL_STATE_VERSION +
        '_building_' +
        CC2DUAL_safeKey(String(level.dimension)) + '_' +
        CC2DUAL_safeKey(CC2DUAL_getVillageUUID(village)) + '_' +
        CC2DUAL_safeKey(String(building.getPlanSetId())) + '_' +
        origin.getX() + '_' +
        origin.getY() + '_' +
        origin.getZ() + '_' +
        CC2DUAL_safeKey(String(building.getVariant())) + '_' +
        building.getLevel()
    )
}


// ============================================================================
// MCA BACKEND
// ============================================================================

function CC2DUAL_spawnMCA(
    level,
    markerPos,
    spec
) {

    if (!CC2DUAL_loadMCA()) {

        return {
            success: false,
            backend: 'mca',
            reason: (
                'MCA classes unavailable: ' +
                CC2DUAL_mcaLoadError
            )
        }
    }

    try {

        var spawnX =
            markerPos.getX() +
            0.5 +
            Number(spec.offsetX)

        var spawnY =
            markerPos.getY() +
            0.05 +
            Number(spec.offsetY)

        var spawnZ =
            markerPos.getZ() +
            0.5 +
            Number(spec.offsetZ)

        var factory =
            CC2DUAL_mcaFactoryClass
                .newVillager(level)

        // Three arguments deliberately select MCA's unambiguous
        // withPosition(double, double, double) overload.
        factory.withPosition(
            spawnX,
            spawnY,
            spawnZ
        )

        var gender =
            spec.gender == null
            ? 'random'
            : String(spec.gender).toLowerCase()

        if (gender == 'male') {
            factory.withGender(
                CC2DUAL_mcaGenderClass.MALE
            )
        }

        else if (gender == 'female') {
            factory.withGender(
                CC2DUAL_mcaGenderClass.FEMALE
            )
        }

        // random = deliberately do not call withGender().
        // MCA's own VillagerFactory chooses its normal random gender.

        var chosenName =
            CC2DUAL_chooseString(
                spec.name,
                spec.names
            )

        if (chosenName != null) {
            factory.withName(chosenName)
        }

        // Omit age to let MCA's own factory choose its normal age.
        if (spec.age != null) {
            factory.withAge(
                Number(spec.age)
            )
        }

        var entity =
            factory.spawn(
                $CC2DUAL_MobSpawnType.COMMAND
            )

        if (entity == null) {

            return {
                success: false,
                backend: 'mca',
                reason: 'MCA VillagerFactory returned null'
            }
        }

        entity.addTag('cc2_dual_npc')
        entity.addTag('cc2_dual_mca')
        entity.addTag(
            'cc2_role_' +
            CC2DUAL_safeKey(spec.role)
        )

        // IMPORTANT:
        // MCA spawning has already succeeded at this point.
        //
        // Do NOT query Entity#getUUID() here. In this 1.21.1/KubeJS runtime
        // that Java method is not exposed under getUUID(), which previously
        // caused a real successful spawn to be misreported as a failure.
        //
        // v2 is intentionally one-shot, so we do not need an MCA UUID to
        // remove the marker and mark this template slot complete.
        return {
            success: true,
            backend: 'mca',
            uuid: null,
            label: (
                chosenName != null
                ? chosenName
                : 'MCA villager'
            )
        }
    }

    catch (error) {

        return {
            success: false,
            backend: 'mca',
            reason: String(error)
        }
    }
}


// ============================================================================
// EASY NPC BACKEND
// ============================================================================
//
// Easy NPC config presets live under:
//   config/easy_npc/preset/
//
// This backend defaults to CUSTOM and calls the PresetType-aware overload.
//
// CRITICAL SUCCESS RULE:
// If Easy NPC returns Optional.present, spawning succeeded.
// We return success immediately.
// We do NOT make any additional entity/UUID/name/tag calls afterward.
// ============================================================================

function CC2DUAL_spawnEasyNPC(
    level,
    markerPos,
    spec
) {

    if (!CC2DUAL_loadEasyNPC()) {

        return {
            success: false,
            backend: 'easy_npc',
            reason: (
                'Easy NPC classes unavailable: ' +
                CC2DUAL_easyLoadError
            )
        }
    }


    var presetId =
        CC2DUAL_chooseString(
            spec.preset,
            spec.presets
        )


    if (presetId == null) {

        return {
            success: false,
            backend: 'easy_npc',
            reason: 'No Easy NPC preset configured'
        }
    }


    var presetTypeName =
        spec.presetType == null
        ? 'custom'
        : String(spec.presetType).toLowerCase()


    var presetType = null


    if (presetTypeName == 'custom') {

        presetType =
            CC2DUAL_easyPresetTypeClass.CUSTOM
    }

    else if (presetTypeName == 'data') {

        presetType =
            CC2DUAL_easyPresetTypeClass.DATA
    }

    else {

        return {
            success: false,
            backend: 'easy_npc',
            preset: presetId,
            reason: (
                'Unsupported presetType "' +
                presetTypeName +
                '". Use custom or data.'
            )
        }
    }


    try {

        var spawnX =
            markerPos.getX() +
            0.5 +
            Number(spec.offsetX)

        var spawnY =
            markerPos.getY() +
            0.05 +
            Number(spec.offsetY)

        var spawnZ =
            markerPos.getZ() +
            0.5 +
            Number(spec.offsetZ)


        var presetResource =
            $CC2DUAL_ResourceLocation
                .parse(presetId)


        var position =
            new $CC2DUAL_Vec3(
                spawnX,
                spawnY,
                spawnZ
            )


        var optionalEasyNPC =
            CC2DUAL_easyHandlerClass
                .spawnFromPreset(
                    presetType,
                    presetResource,
                    level,
                    position,
                    null,
                    null
                )


        if (
            optionalEasyNPC == null ||
            !optionalEasyNPC.isPresent()
        ) {

            return {
                success: false,
                backend: 'easy_npc',
                preset: presetId,
                reason: (
                    'Easy NPC returned Optional.empty() ' +
                    'for ' +
                    presetTypeName.toUpperCase() +
                    ' preset'
                )
            }
        }


        // STOP HERE.
        // Optional.present is our success boundary.
        // No post-spawn entity calls that can turn a real spawn into
        // a false failure and leave the carpet behind.
        return {
            success: true,
            backend: 'easy_npc',
            preset: presetId,
            uuid: null,
            label: (
                presetTypeName.toUpperCase() +
                ':' +
                presetId
            )
        }
    }


    catch (error) {

        return {
            success: false,
            backend: 'easy_npc',
            preset: presetId,
            reason: String(error)
        }
    }
}


// ============================================================================
// BACKEND DISPATCH
// ============================================================================

function CC2DUAL_spawnForSpec(
    level,
    markerPos,
    spec
) {

    if (spec.backend == null) {

        return {
            success: false,
            backend: 'none',
            reason: 'No backend configured for role'
        }
    }

    var backend =
        String(spec.backend)
            .toLowerCase()

    if (backend == 'mca') {

        return CC2DUAL_spawnMCA(
            level,
            markerPos,
            spec
        )
    }

    if (
        backend == 'easy_npc' ||
        backend == 'easynpc' ||
        backend == 'easy'
    ) {

        return CC2DUAL_spawnEasyNPC(
            level,
            markerPos,
            spec
        )
    }

    return {
        success: false,
        backend: backend,
        reason: (
            'Unknown backend "' +
            backend +
            '"'
        )
    }
}


// ============================================================================
// ONE EXACT MILLENAIRE CARPET MARKER
// ============================================================================

function CC2DUAL_processMarker(
    server,
    level,
    village,
    building,
    planLevel,
    relativePos,
    expectedCarpetId,
    role
) {

    var worldPos =
        building
            .getOrigin()
            .offset(relativePos)

    var spec =
        CC2DUAL_resolveSpec(
            village,
            building,
            role
        )

    var base =
        CC2DUAL_slotBase(
            level,
            village,
            building,
            planLevel,
            relativePos,
            role
        )

    var processedKey =
        base + '_processed'

    var uuidKey =
        base + '_uuid'

    var backendKey =
        base + '_backend'

    var profileKey =
        base + '_profile'

    var data =
        server.persistentData

    // Already successfully handled in an earlier scan.
    if (data.getBoolean(processedKey)) {

        return {
            done: true
        }
    }


    // Disabled rules deliberately do nothing and leave the marker in place.
    if (!spec.enabled) {

        return {
            done: false
        }
    }


    // If the role has not been assigned a backend yet, leave the carpet there.
    if (spec.backend == null) {

        var noBackendWarning =
            spec.cultureId +
            '|' +
            spec.villageTypeId +
            '|' +
            spec.buildingId +
            '|' +
            role +
            '|no_backend'

        if (!CC2DUAL_warned[noBackendWarning]) {

            console.warn(
                '[CC2 Dual NPC Markers] NO BACKEND: ' +
                'role=' + role +
                ', culture=' + spec.cultureId +
                ', village=' + spec.villageTypeId +
                ', building=' + spec.buildingId +
                '. Carpet left in place.'
            )

            CC2DUAL_warned[noBackendWarning] = true
        }

        return {
            done: false
        }
    }


    // Check the real world block. This is why an arbitrary player-placed
    // carpet elsewhere is ignored: we only reach this position through
    // Millenaire's compiled placement steps.
    var actualBlockId =
        $CC2DUAL_BuiltInRegistries.BLOCK
            .getKey(
                level
                    .getBlockState(worldPos)
                    .getBlock()
            )
            .toString()


    if (
        actualBlockId !=
        expectedCarpetId
    ) {

        // If an old upgrade level's marker no longer exists physically,
        // retire that obsolete slot rather than scanning it forever.
        if (
            planLevel <
            building.getLevel()
        ) {

            data.putBoolean(
                processedKey,
                true
            )

            return {
                done: true
            }
        }

        return {
            done: false
        }
    }


    // The backend is called BEFORE the carpet is touched.
    var result =
        CC2DUAL_spawnForSpec(
            level,
            worldPos,
            spec
        )


    if (!result.success) {

        var failureWarning =
            base +
            '|' +
            result.backend +
            '|' +
            result.reason

        if (!CC2DUAL_warned[failureWarning]) {

            console.warn(
                '[CC2 Dual NPC Markers] SPAWN FAILED: ' +
                'backend=' + result.backend +
                ', role=' + role +
                ', culture=' + spec.cultureId +
                ', village=' + spec.villageTypeId +
                ', building=' + spec.buildingId +
                ', marker=' + expectedCarpetId +
                ', at=' + worldPos +
                ', reason=' + result.reason +
                '. Carpet left in place.'
            )

            CC2DUAL_warned[failureWarning] = true
        }

        return {
            done: false
        }
    }


    // SUCCESS. Only now is the marker consumed.
    if (spec.removeMarker) {

        level.setBlockAndUpdate(
            worldPos,
            $CC2DUAL_Blocks.AIR
                .defaultBlockState()
        )
    }


    data.putBoolean(
        processedKey,
        true
    )

    data.putString(
        uuidKey,
        result.uuid == null
        ? ''
        : String(result.uuid)
    )

    data.putString(
        backendKey,
        String(result.backend)
    )

    data.putString(
        profileKey,
        result.label == null
        ? ''
        : String(result.label)
    )


    console.info(
        '[CC2 Dual NPC Markers] SPAWN OK: ' +
        'backend=' + result.backend +
        ', role=' + role +
        ', profile="' +
        (
            result.label == null
            ? ''
            : result.label
        ) +
        '"' +
        ', culture=' + spec.cultureId +
        ', village=' + spec.villageTypeId +
        ', villageUUID=' + spec.villageUUID +
        ', building=' + spec.buildingId +
        ', marker=' + expectedCarpetId +
        ', at=' + worldPos +
        ', uuid=' + result.uuid
    )


    return {
        done: true
    }
}


// ============================================================================
// OPTIMIZED BUILDING DISCOVERY / MARKER CACHE
// ============================================================================
//
// v6 changes only HOW work is scheduled. Marker meaning, rule resolution,
// backend calls, persistent keys, and "remove carpet only after success" are
// unchanged.
//
// Old behavior:
//   every 5 seconds -> every village -> every building -> compile templates
//
// v6 behavior:
//   slow discovery pass -> queue unfinished buildings
//   -> compile marker coordinates ONCE per building level
//   -> retry cached coordinates with 5/15/30/60 second backoff
//   -> process only a few buildings per work cycle
//
// The cache is deliberately runtime-only. /reload or a server restart simply
// rebuilds it; persistent processed/done keys prevent duplicate NPC spawns.
// ============================================================================


function CC2DUAL_buildingRuntimeKey(
    level,
    village,
    building
) {

    var origin =
        building.getOrigin()

    return (
        CC2DUAL_safeKey(String(level.dimension)) + '|' +
        CC2DUAL_safeKey(CC2DUAL_getVillageUUID(village)) + '|' +
        CC2DUAL_safeKey(String(building.getPlanSetId())) + '|' +
        origin.getX() + '|' +
        origin.getY() + '|' +
        origin.getZ() + '|' +
        CC2DUAL_safeKey(String(building.getVariant()))
    )
}


function CC2DUAL_enqueueRecord(record) {

    if (
        record == null ||
        record.queued
    ) {
        return
    }

    record.queued = true

    CC2DUAL_workQueue.push(
        record.runtimeKey
    )
}


function CC2DUAL_dequeueRecord() {

    while (
        CC2DUAL_workQueueHead <
        CC2DUAL_workQueue.length
    ) {

        var runtimeKey =
            CC2DUAL_workQueue[
                CC2DUAL_workQueueHead
            ]

        CC2DUAL_workQueueHead++

        var record =
            CC2DUAL_runtimeBuildings[
                runtimeKey
            ]

        if (record == null) {
            continue
        }

        record.queued = false

        // Periodically compact the consumed prefix so the queue itself never
        // grows forever in a long-running world.
        if (
            CC2DUAL_workQueueHead > 128 &&
            CC2DUAL_workQueueHead * 2 >
            CC2DUAL_workQueue.length
        ) {

            CC2DUAL_workQueue =
                CC2DUAL_workQueue.slice(
                    CC2DUAL_workQueueHead
                )

            CC2DUAL_workQueueHead = 0
        }

        return record
    }


    // Queue fully consumed: reset it to a fresh empty array.
    if (
        CC2DUAL_workQueueHead >=
        CC2DUAL_workQueue.length
    ) {

        CC2DUAL_workQueue = []
        CC2DUAL_workQueueHead = 0
    }

    return null
}


function CC2DUAL_compileMarkerCache(
    level,
    building
) {

    var markers = []

    var planSet =
        $CC2DUAL_ModCultures
            .getBuildingPlanSet(
                building.getPlanSetId()
            )


    if (planSet == null) {

        return {
            ok: false,
            markers: markers,
            reason: 'BuildingPlanSet not found'
        }
    }


    var variant =
        building.getVariant()

    var currentLevel =
        building.getLevel()


    // Scan every built level, exactly like v5 did. The difference is that
    // the resulting marker coordinates are cached and reused on retries.
    for (
        var planLevel = 0;
        planLevel <= currentLevel;
        planLevel++
    ) {

        var planId

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
            $CC2DUAL_ModCultures
                .getBuildingPlan(planId)


        if (plan == null) {
            continue
        }


        var placementSteps =
            $CC2DUAL_BuildingPlacer
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

            var placementStep =
                placementSteps.get(i)


            var templateBlockId =
                $CC2DUAL_BuiltInRegistries.BLOCK
                    .getKey(
                        placementStep
                            .blockState()
                            .getBlock()
                    )
                    .toString()


            var role =
                CC2DUAL_MARKER_ROLES[
                    templateBlockId
                ]


            if (role == null) {
                continue
            }


            // BlockPos is immutable, so keeping this relative position in the
            // runtime cache is safe and avoids reconstructing placement steps.
            markers.push({
                planLevel: planLevel,
                relativePos:
                    placementStep.relativePos(),
                expectedCarpetId:
                    templateBlockId,
                role: role
            })
        }
    }


    return {
        ok: true,
        markers: markers,
        reason: null
    }
}


function CC2DUAL_processBuildingRecord(
    server,
    record
) {

    var level =
        record.level

    var village =
        record.village

    var building =
        record.building


    if (
        level == null ||
        village == null ||
        building == null
    ) {

        return {
            complete: false,
            retry: true,
            pending: 1
        }
    }


    if (!building.isOperational()) {

        return {
            complete: false,
            retry: true,
            pending: 1
        }
    }


    var currentLevel =
        building.getLevel()

    var doneKey =
        CC2DUAL_buildingDoneKey(
            level,
            village,
            building
        )


    if (
        server.persistentData
            .getBoolean(doneKey)
    ) {

        return {
            complete: true,
            retry: false,
            pending: 0
        }
    }


    // Upgrades invalidate only this building's runtime marker cache.
    if (
        record.cachedLevel !=
        currentLevel
    ) {

        record.markers = null
        record.cachedLevel = currentLevel
        record.retryStage = 0
    }


    // Expensive path: compile the Millenaire template ONCE for this building
    // level. All later retries use the cached marker positions below.
    if (record.markers == null) {

        var compiled =
            CC2DUAL_compileMarkerCache(
                level,
                building
            )


        if (!compiled.ok) {

            var compileWarning =
                record.runtimeKey +
                '|compile|' +
                compiled.reason

            if (
                !CC2DUAL_warned[
                    compileWarning
                ]
            ) {

                console.warn(
                    '[CC2 Dual NPC Markers] CACHE BUILD FAILED: ' +
                    'building=' +
                    building.getPlanSetId() +
                    ', level=' +
                    currentLevel +
                    ', reason=' +
                    compiled.reason
                )

                CC2DUAL_warned[
                    compileWarning
                ] = true
            }


            return {
                complete: false,
                retry: true,
                pending: 1
            }
        }


        record.markers =
            compiled.markers


        if (CC2DUAL_DEBUG) {

            console.info(
                '[CC2 Dual NPC Markers] CACHE: ' +
                'building=' +
                building.getPlanSetId() +
                ', level=' +
                currentLevel +
                ', markers=' +
                record.markers.length
            )
        }
    }


    var markerCount =
        record.markers.length

    var doneCount = 0
    var pendingCount = 0


    // No carpet markers in this building level stack: permanently retire it.
    if (markerCount == 0) {

        server.persistentData
            .putBoolean(
                doneKey,
                true
            )


        return {
            complete: true,
            retry: false,
            pending: 0
        }
    }


    for (
        var i = 0;
        i < record.markers.length;
        i++
    ) {

        var marker =
            record.markers[i]


        var result =
            CC2DUAL_processMarker(
                server,
                level,
                village,
                building,
                marker.planLevel,
                marker.relativePos,
                marker.expectedCarpetId,
                marker.role
            )


        if (result.done) {
            doneCount++
        }

        else {
            pendingCount++
        }
    }


    if (CC2DUAL_DEBUG) {

        console.info(
            '[CC2 Dual NPC Markers] WORK: ' +
            'culture=' +
            village.getCultureId() +
            ', village=' +
            village.getVillageTypeId() +
            ', villageUUID=' +
            CC2DUAL_getVillageUUID(village) +
            ', building=' +
            building.getPlanSetId() +
            ', level=' +
            currentLevel +
            ', markers=' +
            markerCount +
            ', done=' +
            doneCount +
            ', pending=' +
            pendingCount
        )
    }


    if (pendingCount == 0) {

        server.persistentData
            .putBoolean(
                doneKey,
                true
            )


        return {
            complete: true,
            retry: false,
            pending: 0
        }
    }


    return {
        complete: false,
        retry: true,
        pending: pendingCount
    }
}


// ============================================================================
// LIGHTWEIGHT DISCOVERY PASS
// ============================================================================
//
// This still walks Millenaire's registered village/building lists so newly
// created or upgraded buildings can be noticed. It DOES NOT compile placement
// steps. That expensive work happens only for queued unfinished buildings.
// ============================================================================

function CC2DUAL_discoverBuildings(
    server
) {

    var seenThisPass = {}

    var discovered = 0
    var alreadyComplete = 0


    var levels =
        server
            .getAllLevels()
            .iterator()


    while (levels.hasNext()) {

        var cc2DualLevel =
            levels.next()


        var savedData =
            $CC2DUAL_VillageSavedData
                .get(cc2DualLevel)


        var villages =
            savedData
                .getVillageManager()
                .getAllVillages()
                .iterator()


        while (villages.hasNext()) {

            var cc2DualVillage =
                villages.next()


            var buildings =
                cc2DualVillage
                    .getBuildings()
                    .iterator()


            while (buildings.hasNext()) {

                var cc2DualBuilding =
                    buildings.next()


                if (
                    !cc2DualBuilding
                        .isOperational()
                ) {
                    continue
                }


                var doneKey =
                    CC2DUAL_buildingDoneKey(
                        cc2DualLevel,
                        cc2DualVillage,
                        cc2DualBuilding
                    )


                var runtimeKey =
                    CC2DUAL_buildingRuntimeKey(
                        cc2DualLevel,
                        cc2DualVillage,
                        cc2DualBuilding
                    )


                seenThisPass[
                    runtimeKey
                ] = true


                if (
                    server.persistentData
                        .getBoolean(doneKey)
                ) {

                    alreadyComplete++

                    // If an old runtime record still exists, retire it.
                    delete CC2DUAL_runtimeBuildings[
                        runtimeKey
                    ]

                    continue
                }


                discovered++


                var currentLevel =
                    cc2DualBuilding
                        .getLevel()


                var record =
                    CC2DUAL_runtimeBuildings[
                        runtimeKey
                    ]


                if (record == null) {

                    record = {
                        runtimeKey:
                            runtimeKey,
                        level:
                            cc2DualLevel,
                        village:
                            cc2DualVillage,
                        building:
                            cc2DualBuilding,
                        cachedLevel:
                            -2147483648,
                        markers:
                            null,
                        retryStage:
                            0,
                        nextRetryTick:
                            CC2DUAL_serverTick,
                        queued:
                            false,
                        lastSeenTick:
                            CC2DUAL_serverTick
                    }


                    CC2DUAL_runtimeBuildings[
                        runtimeKey
                    ] = record


                    CC2DUAL_enqueueRecord(
                        record
                    )
                }

                else {

                    // Refresh Java references from the authoritative Millenaire
                    // registry in case a save/load cycle replaced an object.
                    record.level =
                        cc2DualLevel

                    record.village =
                        cc2DualVillage

                    record.building =
                        cc2DualBuilding

                    record.lastSeenTick =
                        CC2DUAL_serverTick


                    if (
                        record.cachedLevel !=
                        currentLevel
                    ) {

                        // New building level: do not wait for an old backoff.
                        record.markers = null
                        record.retryStage = 0
                        record.nextRetryTick =
                            CC2DUAL_serverTick

                        CC2DUAL_enqueueRecord(
                            record
                        )
                    }
                }
            }
        }
    }


    // Remove runtime records for buildings that disappeared, became
    // non-operational, or otherwise were absent from this authoritative pass.
    for (
        var runtimeKey in
        CC2DUAL_runtimeBuildings
    ) {

        if (!seenThisPass[runtimeKey]) {

            delete CC2DUAL_runtimeBuildings[
                runtimeKey
            ]
        }
    }


    if (CC2DUAL_DEBUG) {

        console.info(
            '[CC2 Dual NPC Markers] DISCOVERY: ' +
            'unfinished=' +
            discovered +
            ', complete=' +
            alreadyComplete +
            ', runtimeCache=' +
            Object.keys(
                CC2DUAL_runtimeBuildings
            ).length
        )
    }
}


// ============================================================================
// RETRY / WORK SCHEDULER
// ============================================================================

function CC2DUAL_queueDueRecords() {

    for (
        var runtimeKey in
        CC2DUAL_runtimeBuildings
    ) {

        var record =
            CC2DUAL_runtimeBuildings[
                runtimeKey
            ]


        if (
            record == null ||
            record.queued
        ) {
            continue
        }


        if (
            CC2DUAL_serverTick >=
            record.nextRetryTick
        ) {

            CC2DUAL_enqueueRecord(
                record
            )
        }
    }
}


function CC2DUAL_scheduleRetry(
    record
) {

    var stage =
        Number(record.retryStage)


    if (
        !isFinite(stage) ||
        stage < 0
    ) {
        stage = 0
    }


    var maxStage =
        CC2DUAL_RETRY_BACKOFF_TICKS
            .length - 1


    if (stage > maxStage) {
        stage = maxStage
    }


    var delay =
        Number(
            CC2DUAL_RETRY_BACKOFF_TICKS[
                stage
            ]
        )


    record.nextRetryTick =
        CC2DUAL_serverTick +
        delay


    if (stage < maxStage) {
        record.retryStage =
            stage + 1
    }

    else {
        record.retryStage =
            maxStage
    }
}


function CC2DUAL_processWorkCycle(
    server
) {

    CC2DUAL_queueDueRecords()


    var processedBuildings = 0


    while (
        processedBuildings <
        CC2DUAL_MAX_BUILDINGS_PER_WORK_CYCLE
    ) {

        var record =
            CC2DUAL_dequeueRecord()


        if (record == null) {
            break
        }


        // A stale queue entry can survive after discovery deletes a record.
        if (
            CC2DUAL_runtimeBuildings[
                record.runtimeKey
            ] !== record
        ) {
            continue
        }


        try {

            var result =
                CC2DUAL_processBuildingRecord(
                    server,
                    record
                )


            processedBuildings++


            if (result.complete) {

                delete CC2DUAL_runtimeBuildings[
                    record.runtimeKey
                ]

                continue
            }


            if (result.retry) {

                CC2DUAL_scheduleRetry(
                    record
                )
            }
        }


        catch (error) {

            processedBuildings++

            var workWarning =
                record.runtimeKey +
                '|work|' +
                String(error)


            if (
                !CC2DUAL_warned[
                    workWarning
                ]
            ) {

                console.error(
                    '[CC2 Dual NPC Markers] BUILDING WORK ERROR: ' +
                    error
                )

                CC2DUAL_warned[
                    workWarning
                ] = true
            }


            CC2DUAL_scheduleRetry(
                record
            )
        }
    }
}


// ============================================================================
// SERVER TICK
// ============================================================================

ServerEvents.tick(function (event) {

    CC2DUAL_serverTick++


    try {

        // First discovery still happens after five seconds like v5.
        // Later passes are slower because they are only for discovering
        // new/upgraded buildings, not for retrying existing markers.
        if (
            CC2DUAL_serverTick ==
                CC2DUAL_FIRST_DISCOVERY_TICK ||
            (
                CC2DUAL_serverTick >
                    CC2DUAL_FIRST_DISCOVERY_TICK &&
                (
                    (
                        CC2DUAL_serverTick -
                        CC2DUAL_FIRST_DISCOVERY_TICK
                    ) %
                    CC2DUAL_DISCOVERY_INTERVAL_TICKS
                ) == 0
            )
        ) {

            CC2DUAL_discoverBuildings(
                event.server
            )
        }


        if (
            (
                CC2DUAL_serverTick %
                CC2DUAL_WORK_INTERVAL_TICKS
            ) == 0
        ) {

            CC2DUAL_processWorkCycle(
                event.server
            )
        }
    }


    catch (error) {

        console.error(
            '[CC2 Dual NPC Markers] MAIN ERROR: ' +
            error
        )
    }
})
