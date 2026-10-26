// ============================================================================
// CIVCRAFT 2 - MODULAR VILLAGER POSSESSIONS v5 OPTIMIZED
// Minecraft 1.21.1 / NeoForge / KubeJS / Millenaire 9.0.0-beta.2
// ============================================================================
//
// This is the expandable replacement for the working v3 possessions script.
//
// DESIGN:
// - ONLY containers placed as part of a Millenaire building template qualify.
// - Player-placed copies are ignored.
// - One physical container = one shared inventory for everybody.
// - Containers never regenerate after they have been processed.
// - Existing non-empty containers are never overwritten.
// - Loot can be inherited/overridden at FOUR levels:
//
//      DEFAULT
//        -> CULTURE
//          -> VILLAGE TYPE
//            -> BUILDING
//              -> EXACT CULTURE+VILLAGE+BUILDING CONTEXT
//
// The top CONFIG section is deliberately meant to be edited by you.
// The engine starts below "ENGINE - YOU GENERALLY DO NOT NEED TO EDIT THIS".
//
// ============================================================================

console.info('[CC2 Possessions v5 OPTIMIZED] SCRIPT LOADED')


// ============================================================================
// CONFIG - START HERE
// ============================================================================


// ----------------------------------------------------------------------------
// 1. GENERAL SETTINGS
// ----------------------------------------------------------------------------

// Persistent-data version.
//
// IMPORTANT:
// Changing loot tables DOES NOT require changing this.
// New buildings will automatically use your newest configuration.
//
// Change "v4" to "v5", "v6", etc. ONLY when you deliberately want existing
// Millenaire buildings in a test world to be reconsidered.
//
// A version bump can refill an old possession container ONCE if it is empty,
// because the new version treats it as not-yet-processed.
// Engine v5 intentionally keeps the persistent-data namespace at v4 so
// already-processed containers/buildings do NOT regenerate after this upgrade.
var CC2P_DATA_VERSION = 'v4'

// Lightweight discovery pass for new/upgraded Millenaire buildings.
// 200 ticks = roughly 10 seconds.
//
// The 150-tick phase intentionally staggers Possessions away from the
// carpet-marker scanner so both systems do not tend to wake on the same tick.
var CC2P_DISCOVERY_INTERVAL_TICKS = 200
var CC2P_DISCOVERY_PHASE_TICKS = 150

// Work queue pacing.
// At most this many unfinished buildings do possession work per work cycle.
var CC2P_WORK_INTERVAL_TICKS = 20
var CC2P_MAX_BUILDINGS_PER_WORK_CYCLE = 2

// Failed/pending buildings retry progressively more slowly.
// 100 / 300 / 600 / 1200 ticks = 5s / 15s / 30s / 60s.
var CC2P_RETRY_BACKOFF_TICKS = [
    100,
    300,
    600,
    1200
]

// Set true while adding cultures/villages/buildings.
// Keep false in normal play to avoid routine scan-log I/O.
var CC2P_DEBUG = false


// ----------------------------------------------------------------------------
// 2. SUPPORTED POSSESSION CONTAINERS
// ----------------------------------------------------------------------------
//
// The built-in matcher already supports:
// - Farmer's Delight bamboo/wooden baskets
// - Farmer's Delight *..._cabinet blocks
// - Supplementaries sack
// - Refurbished Furniture blocks containing "drawer" or "cabinet"
// - TFC blocks whose registry path contains "large_vessel"
//
// Add exact extra block IDs here if you add another storage mod.
//
// EXAMPLE:
//   'handcrafted:oak_cupboard',
//
var CC2P_EXTRA_CONTAINER_BLOCKS = [
    // 'some_mod:some_container'
]


// ----------------------------------------------------------------------------
// 3. NAMED LOOT TABLES
// ----------------------------------------------------------------------------
//
// These are "loot tables" for this script.
// They are intentionally simple and very easy to extend.
//
// FORMAT:
//   'table_name': [
//       { id: 'mod:item', weight: 10, min: 1, max: 3 },
//       { id: 'mod:other_item', weight: 2, min: 1, max: 1 }
//   ]
//
// WEIGHT:
//   Relative chance when this table is part of a resolved profile.
//   Weight 20 is twice as common as weight 10.
//
// MIN/MAX:
//   Stack size when that entry is selected.
//
// You can create as many named tables as you want.
//
var CC2P_LOOT_TABLES = {

    // ------------------------------------------------------------------------
    // Generic household clutter.
    // Used by every settlement unless a rule replaces inherited tables.
    // ------------------------------------------------------------------------
    'common_household': [
        { id: 'minecraft:stick',          weight: 20, min: 1, max: 5 },
        { id: 'minecraft:string',         weight: 16, min: 1, max: 3 },
        { id: 'minecraft:flint',          weight: 12, min: 1, max: 3 },
        { id: 'minecraft:bowl',           weight: 10, min: 1, max: 2 },
        { id: 'minecraft:clay_ball',      weight: 9,  min: 1, max: 4 },
        { id: 'minecraft:charcoal',       weight: 7,  min: 1, max: 2 },
        { id: 'minecraft:torch',          weight: 6,  min: 1, max: 3 },
        { id: 'minecraft:candle',         weight: 4,  min: 1, max: 1 }
    ],

    // ------------------------------------------------------------------------
    // Culture-wide Norman flavor.
    // ------------------------------------------------------------------------
    'norman_common': [
        { id: 'minecraft:leather',        weight: 7,  min: 1, max: 1 },
        { id: 'farmersdelight:canvas',    weight: 6,  min: 1, max: 2 },
        { id: 'minecraft:wheat_seeds',    weight: 6,  min: 1, max: 4 },
        { id: 'tfc:straw',                weight: 6,  min: 1, max: 5 },
        { id: 'minecraft:feather',        weight: 5,  min: 1, max: 3 }
    ],

    // ------------------------------------------------------------------------
    // Extra flavor for the Survival Village specifically.
    // ------------------------------------------------------------------------
    'survival_village_common': [
        { id: 'minecraft:bone',           weight: 7,  min: 1, max: 2 },
        { id: 'minecraft:charcoal',       weight: 6,  min: 1, max: 2 },
        { id: 'tfc:straw',                weight: 8,  min: 1, max: 5 },
        { id: 'minecraft:clay_ball',      weight: 6,  min: 1, max: 3 }
    ],

    // ------------------------------------------------------------------------
    // Forager Hut-specific possessions.
    // ------------------------------------------------------------------------
    'forager_hut': [
        { id: 'minecraft:wheat_seeds',       weight: 14, min: 1, max: 5 },
        { id: 'minecraft:feather',           weight: 12, min: 1, max: 4 },
        { id: 'minecraft:bone',              weight: 9,  min: 1, max: 2 },
        { id: 'minecraft:string',            weight: 8,  min: 1, max: 3 },
        { id: 'minecraft:flint',             weight: 7,  min: 1, max: 2 },

        // Tiny rare curiosity; intentionally not meaningful treasure.
        { id: 'tfc:ore/small_native_copper', weight: 1,  min: 1, max: 1 }
    ],

    // ------------------------------------------------------------------------
    // READY-MADE TEMPLATE TABLES.
    // They are not used until you add rules for them below.
    // ------------------------------------------------------------------------

    'kitchen_template': [
        { id: 'minecraft:bowl',           weight: 18, min: 1, max: 3 },
        { id: 'minecraft:charcoal',       weight: 8,  min: 1, max: 2 },
        { id: 'minecraft:clay_ball',      weight: 6,  min: 1, max: 2 }
    ],

    'workshop_template': [
        { id: 'minecraft:string',         weight: 12, min: 1, max: 3 },
        { id: 'minecraft:leather',        weight: 10, min: 1, max: 2 },
        { id: 'farmersdelight:canvas',    weight: 9,  min: 1, max: 2 },
        { id: 'minecraft:charcoal',       weight: 7,  min: 1, max: 2 },
        { id: 'minecraft:stick',          weight: 12, min: 1, max: 4 }
    ],

    'meetinghall_template': [
        { id: 'minecraft:paper',          weight: 8,  min: 1, max: 3 },
        { id: 'minecraft:book',           weight: 2,  min: 1, max: 1 },
        { id: 'minecraft:candle',         weight: 8,  min: 1, max: 2 },
        { id: 'minecraft:torch',          weight: 6,  min: 1, max: 3 }
    ],

    // Copy this when creating a brand-new table:
    'NEW_TABLE_TEMPLATE': [
        // { id: 'minecraft:stick', weight: 10, min: 1, max: 3 }
    ]
}


// ----------------------------------------------------------------------------
// 4. DEFAULT PROFILE
// ----------------------------------------------------------------------------
//
// Every qualifying container begins with this profile.
//
// emptyChance:
//   Percent chance that a container has absolutely nothing.
//
// minRolls/maxRolls:
//   Number of DIFFERENT randomly chosen slots/stacks.
//
// tables:
//   Named loot tables from CC2P_LOOT_TABLES.
//
var CC2P_DEFAULT_PROFILE = {
    tables: ['common_household'],
    emptyChance: 20,
    minRolls: 1,
    maxRolls: 4,
    disabled: false
}


// ----------------------------------------------------------------------------
// 5. CULTURE RULES
// ----------------------------------------------------------------------------
//
// A culture rule applies to every village/building belonging to that culture.
//
// IMPORTANT RULE FIELDS:
//
// addTables: ['table_a', 'table_b']
//   Adds tables to whatever was inherited.
//
// setTables: ['table_a']
//   REPLACES all previously inherited tables.
//
// emptyChance / minRolls / maxRolls
//   Optional overrides.
//
// disabled: true
//   Turns possessions off for everything at this level unless a more-specific
//   rule later sets disabled: false.
//
// CURRENT EXAMPLE:
//   All civnormans settlements inherit norman_common.
//
var CC2P_CULTURE_RULES = {

    'millenaire:civnormans': {
        addTables: ['norman_common']
    }

    // ------------------------------------------------------------
    // NEW CULTURE TEMPLATE
    // ------------------------------------------------------------
    //
    // ,'millenaire:civseljuks': {
    //     addTables: ['seljuk_common']
    // }
}


// ----------------------------------------------------------------------------
// 6. VILLAGE TYPE RULES
// ----------------------------------------------------------------------------
//
// This is the exact Millenaire VILLAGE TYPE ID, not the village's generated
// display name.
//
// A village rule is applied AFTER its culture rule.
//
// CURRENT EXAMPLE:
// Survival Village adds its own settlement flavor.
//
var CC2P_VILLAGE_RULES = {

    'millenaire:civnormans/survivalvillage': {
        addTables: ['survival_village_common']
    }

    // ------------------------------------------------------------
    // NEW VILLAGE TEMPLATE
    // ------------------------------------------------------------
    //
    // ,'millenaire:civnormans/some_village_type': {
    //     addTables: ['some_village_table']
    // }
}


// ----------------------------------------------------------------------------
// 7. BUILDING RULES
// ----------------------------------------------------------------------------
//
// Key = Building PLAN SET ID reported by Millenaire.
//
// This applies to that building wherever it appears.
//
// CURRENT EXAMPLE:
// Forager Hut adds forager-specific clutter.
//
var CC2P_BUILDING_RULES = {

    'millenaire:civnormans/foragershut': {
        addTables: ['forager_hut']
    }

    // ------------------------------------------------------------
    // READY-MADE EXAMPLES - uncomment when desired
    // ------------------------------------------------------------
    //
    // ,'millenaire:civnormans/kitchen': {
    //     addTables: ['kitchen_template']
    // }
    //
    // ,'millenaire:civnormans/workshop': {
    //     addTables: ['workshop_template']
    // }
    //
    // ,'millenaire:civnormans/meetinghall': {
    //     addTables: ['meetinghall_template']
    // }

    // ------------------------------------------------------------
    // NEW BUILDING TEMPLATE
    // ------------------------------------------------------------
    //
    // ,'millenaire:civnormans/mybuilding': {
    //     addTables: ['my_building_table']
    // }
}


// ----------------------------------------------------------------------------
// 8. EXACT CONTEXT RULES - OPTIONAL ADVANCED LAYER
// ----------------------------------------------------------------------------
//
// Use this ONLY when the same building should have different possessions
// depending on the exact culture + village type + building combination.
//
// Key format:
//   CULTURE || VILLAGE TYPE || BUILDING
//
// This layer runs LAST and therefore has final say.
//
// EXAMPLE:
// 'millenaire:civnormans||millenaire:civnormans/survivalvillage||millenaire:civnormans/foragershut': {
//     setTables: ['forager_hut'],
//     emptyChance: 10
// }
//
// Notice "setTables" above would throw away common/culture/village tables and
// use ONLY forager_hut.
//
var CC2P_EXACT_CONTEXT_RULES = {

    // 'culture_id||village_type_id||building_plan_set_id': {
    //     addTables: ['some_table']
    // }
}


// ============================================================================
// CONFIG - END
// ============================================================================
//
// ENGINE - YOU GENERALLY DO NOT NEED TO EDIT BELOW THIS LINE
//
// ============================================================================


// ----------------------------------------------------------------------------
// JAVA CLASSES
// ----------------------------------------------------------------------------

var $CC2P_VillageSavedData =
    Java.loadClass('org.millenaire.village.VillageSavedData')

var $CC2P_ModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

var $CC2P_BuildingPlacer =
    Java.loadClass('org.millenaire.world.BuildingPlacer')

var $CC2P_BuiltInRegistries =
    Java.loadClass('net.minecraft.core.registries.BuiltInRegistries')

var $CC2P_ResourceLocation =
    Java.loadClass('net.minecraft.resources.ResourceLocation')

var $CC2P_ItemStack =
    Java.loadClass('net.minecraft.world.item.ItemStack')


var CC2P_runtimeTick = 0
var CC2P_workCounter = 0

// Runtime-only work queue. Persistent completion data still lives in
// server.persistentData, so /reload simply rebuilds this cheap queue.
var CC2P_jobs = {}
var CC2P_jobOrder = []
var CC2P_jobCursor = 0

// Reuse identical resolved profiles and item registry lookups.
var CC2P_profileCache = {}
var CC2P_itemCache = {}

var CC2P_warnedBadItems = {}
var CC2P_warnedMissingTables = {}
var CC2P_warnedRuntime = {}
var CC2P_warnedFillErrors = {}


// ----------------------------------------------------------------------------
// SMALL HELPERS
// ----------------------------------------------------------------------------

function CC2P_safeKey(cc2pText) {
    return String(cc2pText)
        .replace(/:/g, '_')
        .replace(/\//g, '_')
        .replace(/\./g, '_')
        .replace(/-/g, '_')
        .replace(/\|/g, '_')
}


function CC2P_copyArray(cc2pArray) {

    var cc2pCopy = []
    var cc2pI

    if (cc2pArray == null) {
        return cc2pCopy
    }

    for (
        cc2pI = 0;
        cc2pI < cc2pArray.length;
        cc2pI++
    ) {
        cc2pCopy.push(cc2pArray[cc2pI])
    }

    return cc2pCopy
}


function CC2P_contextKey(
    cc2pCultureId,
    cc2pVillageTypeId,
    cc2pBuildingId
) {
    return (
        cc2pCultureId +
        '||' +
        cc2pVillageTypeId +
        '||' +
        cc2pBuildingId
    )
}


// ----------------------------------------------------------------------------
// RULE / PROFILE RESOLUTION
// ----------------------------------------------------------------------------

function CC2P_applyRule(
    cc2pProfile,
    cc2pRule
) {

    if (cc2pRule == null) {
        return
    }

    // setTables = hard replacement
    if (cc2pRule.setTables != null) {
        cc2pProfile.tables =
            CC2P_copyArray(
                cc2pRule.setTables
            )
    }

    // addTables = inheritance/composition
    if (cc2pRule.addTables != null) {

        var cc2pAddIndex

        for (
            cc2pAddIndex = 0;
            cc2pAddIndex <
                cc2pRule.addTables.length;
            cc2pAddIndex++
        ) {

            cc2pProfile.tables.push(
                cc2pRule.addTables[
                    cc2pAddIndex
                ]
            )
        }
    }

    if (
        cc2pRule.emptyChance != null
    ) {
        cc2pProfile.emptyChance =
            cc2pRule.emptyChance
    }

    if (
        cc2pRule.minRolls != null
    ) {
        cc2pProfile.minRolls =
            cc2pRule.minRolls
    }

    if (
        cc2pRule.maxRolls != null
    ) {
        cc2pProfile.maxRolls =
            cc2pRule.maxRolls
    }

    if (
        cc2pRule.disabled != null
    ) {
        cc2pProfile.disabled =
            cc2pRule.disabled
    }
}


function CC2P_buildEntriesFromTables(
    cc2pTableNames
) {

    var cc2pEntries = []
    var cc2pTableIndex

    for (
        cc2pTableIndex = 0;
        cc2pTableIndex <
            cc2pTableNames.length;
        cc2pTableIndex++
    ) {

        var cc2pTableName =
            cc2pTableNames[
                cc2pTableIndex
            ]

        var cc2pTable =
            CC2P_LOOT_TABLES[
                cc2pTableName
            ]

        if (cc2pTable == null) {

            if (
                !CC2P_warnedMissingTables[
                    cc2pTableName
                ]
            ) {

                console.warn(
                    '[CC2 Possessions v5 OPTIMIZED] Unknown loot table "' +
                    cc2pTableName +
                    '"'
                )

                CC2P_warnedMissingTables[
                    cc2pTableName
                ] = true
            }

            continue
        }

        var cc2pEntryIndex

        for (
            cc2pEntryIndex = 0;
            cc2pEntryIndex <
                cc2pTable.length;
            cc2pEntryIndex++
        ) {

            cc2pEntries.push(
                cc2pTable[
                    cc2pEntryIndex
                ]
            )
        }
    }

    return cc2pEntries
}


function CC2P_resolveProfile(
    cc2pVillage,
    cc2pBuilding
) {

    var cc2pCultureId =
        String(
            cc2pVillage.getCultureId()
        )

    var cc2pVillageTypeId =
        String(
            cc2pVillage.getVillageTypeId()
        )

    var cc2pBuildingId =
        String(
            cc2pBuilding.getPlanSetId()
        )

    var cc2pCacheKey =
        CC2P_contextKey(
            cc2pCultureId,
            cc2pVillageTypeId,
            cc2pBuildingId
        )

    if (
        CC2P_profileCache[
            cc2pCacheKey
        ] != null
    ) {
        return CC2P_profileCache[
            cc2pCacheKey
        ]
    }

    var cc2pProfile = {
        cultureId: cc2pCultureId,
        villageTypeId: cc2pVillageTypeId,
        buildingId: cc2pBuildingId,

        tables:
            CC2P_copyArray(
                CC2P_DEFAULT_PROFILE.tables
            ),

        emptyChance:
            CC2P_DEFAULT_PROFILE.emptyChance,

        minRolls:
            CC2P_DEFAULT_PROFILE.minRolls,

        maxRolls:
            CC2P_DEFAULT_PROFILE.maxRolls,

        disabled:
            CC2P_DEFAULT_PROFILE.disabled
    }

    // Most general -> most specific
    CC2P_applyRule(
        cc2pProfile,
        CC2P_CULTURE_RULES[
            cc2pCultureId
        ]
    )

    CC2P_applyRule(
        cc2pProfile,
        CC2P_VILLAGE_RULES[
            cc2pVillageTypeId
        ]
    )

    CC2P_applyRule(
        cc2pProfile,
        CC2P_BUILDING_RULES[
            cc2pBuildingId
        ]
    )

    var cc2pExactKey =
        CC2P_contextKey(
            cc2pCultureId,
            cc2pVillageTypeId,
            cc2pBuildingId
        )

    CC2P_applyRule(
        cc2pProfile,
        CC2P_EXACT_CONTEXT_RULES[
            cc2pExactKey
        ]
    )

    cc2pProfile.entries =
        CC2P_buildEntriesFromTables(
            cc2pProfile.tables
        )

    // Clamp malformed configuration rather than crashing later.
    if (cc2pProfile.emptyChance < 0) {
        cc2pProfile.emptyChance = 0
    }

    if (cc2pProfile.emptyChance > 100) {
        cc2pProfile.emptyChance = 100
    }

    if (cc2pProfile.minRolls < 0) {
        cc2pProfile.minRolls = 0
    }

    if (
        cc2pProfile.maxRolls <
        cc2pProfile.minRolls
    ) {
        cc2pProfile.maxRolls =
            cc2pProfile.minRolls
    }

    CC2P_profileCache[
        cc2pCacheKey
    ] = cc2pProfile

    return cc2pProfile
}


// ----------------------------------------------------------------------------
// TARGET CONTAINER FILTER
// ----------------------------------------------------------------------------

function CC2P_isPossessionContainer(
    cc2pBlockId
) {

    var cc2pExtraIndex

    for (
        cc2pExtraIndex = 0;
        cc2pExtraIndex <
            CC2P_EXTRA_CONTAINER_BLOCKS.length;
        cc2pExtraIndex++
    ) {

        if (
            cc2pBlockId ==
            CC2P_EXTRA_CONTAINER_BLOCKS[
                cc2pExtraIndex
            ]
        ) {
            return true
        }
    }

    // Farmer's Delight baskets
    if (
        cc2pBlockId ==
            'farmersdelight:bamboo_basket' ||
        cc2pBlockId ==
            'farmersdelight:wooden_basket'
    ) {
        return true
    }

    // Farmer's Delight cabinets
    if (
        cc2pBlockId.startsWith(
            'farmersdelight:'
        ) &&
        cc2pBlockId.endsWith(
            '_cabinet'
        )
    ) {
        return true
    }

    // Supplementaries sack
    if (
        cc2pBlockId ==
        'supplementaries:sack'
    ) {
        return true
    }

    // MrCrayfish Refurbished Furniture
    if (
        cc2pBlockId.startsWith(
            'refurbished_furniture:'
        ) &&
        (
            cc2pBlockId.indexOf(
                'drawer'
            ) >= 0 ||
            cc2pBlockId.indexOf(
                'cabinet'
            ) >= 0
        )
    ) {
        return true
    }

    // TerraFirmaCraft large vessel
    if (
        cc2pBlockId.startsWith(
            'tfc:'
        ) &&
        cc2pBlockId.indexOf(
            'large_vessel'
        ) >= 0
    ) {
        return true
    }

    return false
}


// ----------------------------------------------------------------------------
// PERSISTENT KEYS
// ----------------------------------------------------------------------------

function CC2P_buildingKey(
    cc2pLevel,
    cc2pBuilding
) {

    // In this KubeJS/Rhino build, ServerLevel.dimension is exposed as a
    // PROPERTY object. Do not change this back to dimension().
    var cc2pDim =
        CC2P_safeKey(
            String(cc2pLevel.dimension)
        )

    var cc2pOrigin =
        cc2pBuilding.getOrigin()

    return (
        'cc2p_' +
        CC2P_DATA_VERSION +
        '_building_' +
        cc2pDim + '_' +
        cc2pOrigin.getX() + '_' +
        cc2pOrigin.getY() + '_' +
        cc2pOrigin.getZ() + '_' +
        CC2P_safeKey(
            cc2pBuilding.getPlanSetId()
        ) + '_' +
        CC2P_safeKey(
            cc2pBuilding.getVariant()
        ) + '_' +
        cc2pBuilding.getLevel()
    )
}


function CC2P_positionKey(
    cc2pLevel,
    cc2pPos
) {

    var cc2pDim =
        CC2P_safeKey(
            String(cc2pLevel.dimension)
        )

    return (
        'cc2p_' +
        CC2P_DATA_VERSION +
        '_container_' +
        cc2pDim + '_' +
        cc2pPos.getX() + '_' +
        cc2pPos.getY() + '_' +
        cc2pPos.getZ()
    )
}


// ----------------------------------------------------------------------------
// LOOT HELPERS
// ----------------------------------------------------------------------------

function CC2P_pickLoot(
    cc2pRandom,
    cc2pEntries
) {

    var cc2pTotalWeight = 0
    var cc2pI

    for (
        cc2pI = 0;
        cc2pI <
            cc2pEntries.length;
        cc2pI++
    ) {

        var cc2pWeight =
            cc2pEntries[cc2pI].weight

        if (
            cc2pWeight != null &&
            cc2pWeight > 0
        ) {
            cc2pTotalWeight +=
                cc2pWeight
        }
    }

    if (cc2pTotalWeight <= 0) {
        return null
    }

    var cc2pRoll =
        cc2pRandom.nextInt(
            cc2pTotalWeight
        )

    for (
        cc2pI = 0;
        cc2pI <
            cc2pEntries.length;
        cc2pI++
    ) {

        var cc2pEntryWeight =
            cc2pEntries[cc2pI].weight

        if (
            cc2pEntryWeight == null ||
            cc2pEntryWeight <= 0
        ) {
            continue
        }

        cc2pRoll -=
            cc2pEntryWeight

        if (cc2pRoll < 0) {
            return cc2pEntries[cc2pI]
        }
    }

    return null
}


function CC2P_makeStack(
    cc2pEntry,
    cc2pRandom
) {

    if (
        cc2pEntry == null ||
        cc2pEntry.id == null
    ) {
        return null
    }

    try {

        var cc2pRequestedId =
            String(cc2pEntry.id)

        var cc2pCachedItem =
            CC2P_itemCache[
                cc2pRequestedId
            ]

        // false means this ID was already proven invalid.
        if (cc2pCachedItem === false) {
            return null
        }

        var cc2pItem =
            cc2pCachedItem

        if (cc2pItem == null) {

            var cc2pLocation =
                $CC2P_ResourceLocation.parse(
                    cc2pRequestedId
                )

            cc2pItem =
                $CC2P_BuiltInRegistries.ITEM.get(
                    cc2pLocation
                )

            var cc2pResolvedId =
                String(
                    $CC2P_BuiltInRegistries.ITEM
                        .getKey(
                            cc2pItem
                        )
                )

            // Registry#get() can fall back to air for an unknown ID.
            if (
                cc2pResolvedId !=
                cc2pRequestedId
            ) {

                CC2P_itemCache[
                    cc2pRequestedId
                ] = false

                if (
                    !CC2P_warnedBadItems[
                        cc2pRequestedId
                    ]
                ) {

                    console.warn(
                        '[CC2 Possessions v5 OPTIMIZED] Unknown item ID "' +
                        cc2pEntry.id +
                        '" - skipping it.'
                    )

                    CC2P_warnedBadItems[
                        cc2pRequestedId
                    ] = true
                }

                return null
            }

            CC2P_itemCache[
                cc2pRequestedId
            ] = cc2pItem
        }

        var cc2pMin =
            cc2pEntry.min != null
            ? cc2pEntry.min
            : 1

        var cc2pMax =
            cc2pEntry.max != null
            ? cc2pEntry.max
            : cc2pMin

        if (cc2pMin < 1) {
            cc2pMin = 1
        }

        if (cc2pMax < cc2pMin) {
            cc2pMax = cc2pMin
        }

        var cc2pCount =
            cc2pMin

        if (
            cc2pMax >
            cc2pMin
        ) {

            cc2pCount +=
                cc2pRandom.nextInt(
                    cc2pMax -
                    cc2pMin +
                    1
                )
        }

        return new $CC2P_ItemStack(
            cc2pItem,
            cc2pCount
        )
    }

    catch (cc2pBadItemError) {

        if (
            !CC2P_warnedBadItems[
                String(cc2pEntry.id)
            ]
        ) {

            console.warn(
                '[CC2 Possessions v5 OPTIMIZED] Bad item entry "' +
                cc2pEntry.id +
                '": ' +
                cc2pBadItemError
            )

            CC2P_warnedBadItems[
                String(cc2pEntry.id)
            ] = true
        }

        return null
    }
}


function CC2P_chooseRollCount(
    cc2pRandom,
    cc2pProfile,
    cc2pCapacity
) {

    if (
        cc2pRandom.nextInt(100) <
        cc2pProfile.emptyChance
    ) {
        return 0
    }

    var cc2pMin =
        cc2pProfile.minRolls

    var cc2pMax =
        cc2pProfile.maxRolls

    if (cc2pMax <= 0) {
        return 0
    }

    var cc2pRolls =
        cc2pMin

    if (cc2pMax > cc2pMin) {

        cc2pRolls +=
            cc2pRandom.nextInt(
                cc2pMax -
                cc2pMin +
                1
            )
    }

    if (cc2pRolls > cc2pCapacity) {
        cc2pRolls = cc2pCapacity
    }

    return cc2pRolls
}


// ----------------------------------------------------------------------------
// GENERIC VANILLA-STYLE CONTAINER FILLER
// ----------------------------------------------------------------------------
//
// Works with the already-tested container families:
// - Farmer's Delight
// - Supplementaries
// - Refurbished Furniture
//
function CC2P_fillVanillaStyle(
    cc2pLevel,
    cc2pBlockEntity,
    cc2pProfile
) {

    var cc2pSize =
        cc2pBlockEntity.getContainerSize()

    if (cc2pSize <= 0) {
        return 'unsupported'
    }

    var cc2pSlot

    // Do not overwrite pre-existing contents.
    for (
        cc2pSlot = 0;
        cc2pSlot < cc2pSize;
        cc2pSlot++
    ) {

        if (
            !cc2pBlockEntity
                .getItem(cc2pSlot)
                .isEmpty()
        ) {
            return 'already_nonempty'
        }
    }

    if (
        cc2pProfile.entries.length == 0
    ) {
        return 'empty_table'
    }

    var cc2pRandom =
        cc2pLevel.getRandom()

    var cc2pRolls =
        CC2P_chooseRollCount(
            cc2pRandom,
            cc2pProfile,
            cc2pSize
        )

    if (cc2pRolls == 0) {
        return 'empty_roll'
    }

    var cc2pUsedSlots = {}
    var cc2pPlaced = 0
    var cc2pAttempts = 0

    while (
        cc2pPlaced < cc2pRolls &&
        cc2pAttempts < cc2pSize * 12
    ) {

        cc2pAttempts++

        var cc2pChosenSlot =
            cc2pRandom.nextInt(
                cc2pSize
            )

        if (
            cc2pUsedSlots[
                cc2pChosenSlot
            ]
        ) {
            continue
        }

        var cc2pEntry =
            CC2P_pickLoot(
                cc2pRandom,
                cc2pProfile.entries
            )

        var cc2pStack =
            CC2P_makeStack(
                cc2pEntry,
                cc2pRandom
            )

        if (cc2pStack == null) {
            continue
        }

        var cc2pCanPlace = true

        try {

            cc2pCanPlace =
                cc2pBlockEntity.canPlaceItem(
                    cc2pChosenSlot,
                    cc2pStack
                )
        }

        catch (cc2pNoCanPlaceMethod) {
            cc2pCanPlace = true
        }

        if (!cc2pCanPlace) {
            continue
        }

        cc2pBlockEntity.setItem(
            cc2pChosenSlot,
            cc2pStack
        )

        cc2pUsedSlots[
            cc2pChosenSlot
        ] = true

        cc2pPlaced++
    }

    cc2pBlockEntity.setChanged()

    return (
        cc2pPlaced > 0
        ? 'filled_' + cc2pPlaced
        : 'no_valid_items'
    )
}


// ----------------------------------------------------------------------------
// TFC LARGE VESSEL FILLER
// ----------------------------------------------------------------------------

function CC2P_fillTFCLargeVessel(
    cc2pLevel,
    cc2pBlockEntity,
    cc2pProfile
) {

    var cc2pInventory =
        cc2pBlockEntity.getInventory()

    if (cc2pInventory == null) {
        return 'unsupported'
    }

    var cc2pSlots =
        cc2pInventory.getSlots()

    if (cc2pSlots <= 0) {
        return 'unsupported'
    }

    var cc2pSlot

    for (
        cc2pSlot = 0;
        cc2pSlot < cc2pSlots;
        cc2pSlot++
    ) {

        if (
            !cc2pInventory
                .getStackInSlot(
                    cc2pSlot
                )
                .isEmpty()
        ) {
            return 'already_nonempty'
        }
    }

    if (
        cc2pProfile.entries.length == 0
    ) {
        return 'empty_table'
    }

    var cc2pRandom =
        cc2pLevel.getRandom()

    var cc2pRolls =
        CC2P_chooseRollCount(
            cc2pRandom,
            cc2pProfile,
            cc2pSlots
        )

    if (cc2pRolls == 0) {
        return 'empty_roll'
    }

    var cc2pUsedSlots = {}
    var cc2pPlaced = 0
    var cc2pAttempts = 0

    while (
        cc2pPlaced < cc2pRolls &&
        cc2pAttempts < cc2pSlots * 12
    ) {

        cc2pAttempts++

        var cc2pChosenSlot =
            cc2pRandom.nextInt(
                cc2pSlots
            )

        if (
            cc2pUsedSlots[
                cc2pChosenSlot
            ]
        ) {
            continue
        }

        var cc2pEntry =
            CC2P_pickLoot(
                cc2pRandom,
                cc2pProfile.entries
            )

        var cc2pStack =
            CC2P_makeStack(
                cc2pEntry,
                cc2pRandom
            )

        if (cc2pStack == null) {
            continue
        }

        if (
            !cc2pInventory.isItemValid(
                cc2pChosenSlot,
                cc2pStack
            )
        ) {
            continue
        }

        cc2pInventory.setStackInSlot(
            cc2pChosenSlot,
            cc2pStack
        )

        cc2pUsedSlots[
            cc2pChosenSlot
        ] = true

        cc2pPlaced++
    }

    cc2pBlockEntity.setChanged()

    return (
        cc2pPlaced > 0
        ? 'filled_' + cc2pPlaced
        : 'no_valid_items'
    )
}


// ----------------------------------------------------------------------------
// PROCESS ONE EXACT TEMPLATE POSITION
// ----------------------------------------------------------------------------

function CC2P_processPosition(
    cc2pServer,
    cc2pLevel,
    cc2pPos,
    cc2pExpectedBlockId,
    cc2pProfile
) {

    var cc2pPersistent =
        cc2pServer.persistentData

    var cc2pPosKey =
        CC2P_positionKey(
            cc2pLevel,
            cc2pPos
        )

    if (
        cc2pPersistent.getBoolean(
            cc2pPosKey
        )
    ) {
        return 'already_processed'
    }

    var cc2pActualState =
        cc2pLevel.getBlockState(
            cc2pPos
        )

    var cc2pActualBlockId =
        $CC2P_BuiltInRegistries.BLOCK
            .getKey(
                cc2pActualState.getBlock()
            )
            .toString()

    if (
        cc2pActualBlockId !=
        cc2pExpectedBlockId
    ) {
        return (
            'world_mismatch:' +
            cc2pActualBlockId
        )
    }

    var cc2pBlockEntity =
        cc2pLevel.getBlockEntity(
            cc2pPos
        )

    if (cc2pBlockEntity == null) {
        return 'no_block_entity'
    }

    var cc2pResult

    try {

        if (
            cc2pActualBlockId.startsWith(
                'tfc:'
            ) &&
            cc2pActualBlockId.indexOf(
                'large_vessel'
            ) >= 0
        ) {

            cc2pResult =
                CC2P_fillTFCLargeVessel(
                    cc2pLevel,
                    cc2pBlockEntity,
                    cc2pProfile
                )
        }

        else {

            cc2pResult =
                CC2P_fillVanillaStyle(
                    cc2pLevel,
                    cc2pBlockEntity,
                    cc2pProfile
                )
        }
    }

    catch (cc2pFillError) {

        var cc2pFillWarningKey =
            CC2P_positionKey(
                cc2pLevel,
                cc2pPos
            ) +
            '|' +
            String(cc2pFillError)

        if (
            !CC2P_warnedFillErrors[
                cc2pFillWarningKey
            ]
        ) {

            console.error(
                '[CC2 Possessions v5 OPTIMIZED] FAILED ' +
                cc2pActualBlockId +
                ' at ' +
                cc2pPos +
                ': ' +
                cc2pFillError
            )

            CC2P_warnedFillErrors[
                cc2pFillWarningKey
            ] = true
        }

        return 'error'
    }

    // Final outcomes. This position must never regenerate again.
    if (
        cc2pResult ==
            'already_nonempty' ||
        cc2pResult ==
            'empty_roll' ||
        cc2pResult ==
            'empty_table' ||
        cc2pResult.startsWith(
            'filled_'
        ) ||
        cc2pResult ==
            'no_valid_items'
    ) {

        cc2pPersistent.putBoolean(
            cc2pPosKey,
            true
        )
    }

    return cc2pResult
}


// ----------------------------------------------------------------------------
// SCAN ONE MILLENAIRE BUILDING
// ----------------------------------------------------------------------------
//
// Uses Millenaire's own BuildingPlacer.compilePlacementSteps() exactly as the
// working v3 did. No guessed bounding boxes.
//
function CC2P_isFinalPositionResult(
    cc2pResult
) {

    return (
        cc2pResult ==
            'already_processed' ||
        cc2pResult ==
            'already_nonempty' ||
        cc2pResult ==
            'empty_roll' ||
        cc2pResult ==
            'empty_table' ||
        cc2pResult.startsWith(
            'filled_'
        ) ||
        cc2pResult ==
            'no_valid_items'
    )
}


function CC2P_warnOnce(
    cc2pKey,
    cc2pMessage
) {

    if (
        CC2P_warnedRuntime[
            cc2pKey
        ]
    ) {
        return
    }

    CC2P_warnedRuntime[
        cc2pKey
    ] = true

    console.warn(
        cc2pMessage
    )
}


function CC2P_removeJob(
    cc2pKey
) {

    delete CC2P_jobs[
        cc2pKey
    ]
}


function CC2P_compactJobOrder() {

    var cc2pLiveKeys =
        Object.keys(
            CC2P_jobs
        )

    if (
        CC2P_jobOrder.length <=
        cc2pLiveKeys.length * 2 + 32
    ) {
        return
    }

    CC2P_jobOrder =
        cc2pLiveKeys

    CC2P_jobCursor = 0
}


function CC2P_enqueueBuilding(
    cc2pServer,
    cc2pLevel,
    cc2pVillage,
    cc2pBuilding
) {

    if (
        !cc2pBuilding.isOperational()
    ) {
        return
    }

    var cc2pKey =
        CC2P_buildingKey(
            cc2pLevel,
            cc2pBuilding
        )

    if (
        cc2pServer.persistentData
            .getBoolean(
                cc2pKey
            )
    ) {

        CC2P_removeJob(
            cc2pKey
        )

        return
    }

    var cc2pExisting =
        CC2P_jobs[
            cc2pKey
        ]

    if (
        cc2pExisting != null
    ) {

        // Refresh Java references during discovery without discarding cache.
        cc2pExisting.level =
            cc2pLevel

        cc2pExisting.village =
            cc2pVillage

        cc2pExisting.building =
            cc2pBuilding

        return
    }

    CC2P_jobs[
        cc2pKey
    ] = {
        key: cc2pKey,
        level: cc2pLevel,
        village: cc2pVillage,
        building: cc2pBuilding,
        levelNumber:
            cc2pBuilding.getLevel(),
        profile: null,
        targets: null,
        retryIndex: 0,
        nextTick: CC2P_runtimeTick
    }

    CC2P_jobOrder.push(
        cc2pKey
    )
}


function CC2P_discoverBuildings(
    cc2pServer
) {

    var cc2pLevelIterator =
        cc2pServer
            .getAllLevels()
            .iterator()

    while (
        cc2pLevelIterator.hasNext()
    ) {

        var cc2pWorld =
            cc2pLevelIterator.next()

        var cc2pSavedData =
            $CC2P_VillageSavedData.get(
                cc2pWorld
            )

        var cc2pVillages =
            cc2pSavedData
                .getVillageManager()
                .getAllVillages()
                .iterator()

        while (
            cc2pVillages.hasNext()
        ) {

            var cc2pVillage =
                cc2pVillages.next()

            var cc2pBuildings =
                cc2pVillage
                    .getBuildings()
                    .iterator()

            while (
                cc2pBuildings.hasNext()
            ) {

                CC2P_enqueueBuilding(
                    cc2pServer,
                    cc2pWorld,
                    cc2pVillage,
                    cc2pBuildings.next()
                )
            }
        }
    }

    CC2P_compactJobOrder()
}


// ----------------------------------------------------------------------------
// COMPILE ONE BUILDING'S POSSESSION TARGETS ONCE
// ----------------------------------------------------------------------------
//
// This is the expensive Millenaire work. v4 repeated it on every retry.
// v5 stores the resulting world positions in the runtime job and retries only
// those cached positions until the building is complete.
//
function CC2P_prepareJob(
    cc2pServer,
    cc2pJob
) {

    var cc2pBuilding =
        cc2pJob.building

    var cc2pLevel =
        cc2pJob.level

    var cc2pVillage =
        cc2pJob.village

    var cc2pProfile =
        CC2P_resolveProfile(
            cc2pVillage,
            cc2pBuilding
        )

    cc2pJob.profile =
        cc2pProfile

    // disabled profile = intentionally complete with no possessions.
    if (
        cc2pProfile.disabled
    ) {

        cc2pServer.persistentData
            .putBoolean(
                cc2pJob.key,
                true
            )

        return 'complete'
    }

    var cc2pPlanSetId =
        cc2pBuilding.getPlanSetId()

    var cc2pVariant =
        cc2pBuilding.getVariant()

    var cc2pCurrentLevel =
        cc2pJob.levelNumber

    var cc2pPlanSet =
        $CC2P_ModCultures
            .getBuildingPlanSet(
                cc2pPlanSetId
            )

    if (
        cc2pPlanSet == null
    ) {

        CC2P_warnOnce(
            'plan_set|' +
                cc2pPlanSetId,
            '[CC2 Possessions v5 OPTIMIZED] No plan set for ' +
                cc2pPlanSetId
        )

        return 'retry'
    }

    var cc2pTargets = []
    var cc2pPlanLevel

    for (
        cc2pPlanLevel = 0;
        cc2pPlanLevel <=
            cc2pCurrentLevel;
        cc2pPlanLevel++
    ) {

        var cc2pPlanId

        try {

            cc2pPlanId =
                cc2pPlanSet.getPlanId(
                    cc2pVariant,
                    cc2pPlanLevel
                )
        }

        catch (cc2pPlanLookupError) {
            continue
        }

        if (
            cc2pPlanId == null
        ) {
            continue
        }

        var cc2pPlan =
            $CC2P_ModCultures
                .getBuildingPlan(
                    cc2pPlanId
                )

        if (
            cc2pPlan == null
        ) {
            continue
        }

        var cc2pSteps

        try {

            cc2pSteps =
                $CC2P_BuildingPlacer
                    .compilePlacementSteps(
                        cc2pLevel,
                        cc2pPlan,
                        cc2pBuilding.getOrigin(),
                        cc2pBuilding.getRotation()
                    )
        }

        catch (cc2pCompileError) {

            CC2P_warnOnce(
                'compile|' +
                    cc2pJob.key +
                    '|' +
                    cc2pPlanLevel +
                    '|' +
                    cc2pCompileError,
                '[CC2 Possessions v5 OPTIMIZED] Could not compile ' +
                    cc2pPlanSetId +
                    ' level ' +
                    cc2pPlanLevel +
                    ': ' +
                    cc2pCompileError
            )

            return 'retry'
        }

        var cc2pStepIndex

        for (
            cc2pStepIndex = 0;
            cc2pStepIndex <
                cc2pSteps.size();
            cc2pStepIndex++
        ) {

            var cc2pStep =
                cc2pSteps.get(
                    cc2pStepIndex
                )

            var cc2pExpectedBlockId =
                $CC2P_BuiltInRegistries.BLOCK
                    .getKey(
                        cc2pStep
                            .blockState()
                            .getBlock()
                    )
                    .toString()

            if (
                !CC2P_isPossessionContainer(
                    cc2pExpectedBlockId
                )
            ) {
                continue
            }

            cc2pTargets.push({
                planLevel:
                    cc2pPlanLevel,
                pos:
                    cc2pBuilding
                        .getOrigin()
                        .offset(
                            cc2pStep
                                .relativePos()
                        ),
                expectedBlockId:
                    cc2pExpectedBlockId,
                done: false
            })
        }
    }

    cc2pJob.targets =
        cc2pTargets

    // Nothing in any built plan level uses a supported possession container.
    if (
        cc2pTargets.length == 0
    ) {

        cc2pServer.persistentData
            .putBoolean(
                cc2pJob.key,
                true
            )

        return 'complete'
    }

    if (
        CC2P_DEBUG
    ) {

        console.info(
            '[CC2 Possessions v5 OPTIMIZED] CACHED: ' +
            'culture=' +
            cc2pProfile.cultureId +
            ', village=' +
            cc2pProfile.villageTypeId +
            ', building=' +
            cc2pProfile.buildingId +
            ', level=' +
            cc2pCurrentLevel +
            ', tables=[' +
            cc2pProfile.tables.join(', ') +
            '], targets=' +
            cc2pTargets.length
        )
    }

    return 'ready'
}


// ----------------------------------------------------------------------------
// PROCESS ONE QUEUED BUILDING
// ----------------------------------------------------------------------------

function CC2P_processJob(
    cc2pServer,
    cc2pJob
) {

    var cc2pBuilding =
        cc2pJob.building

    if (
        cc2pBuilding == null ||
        !cc2pBuilding.isOperational()
    ) {

        CC2P_removeJob(
            cc2pJob.key
        )

        return
    }

    // If the building upgraded since this job was discovered, retire the
    // stale runtime job. The next discovery pass will create the new
    // level-specific building key and compile all built levels once.
    if (
        cc2pBuilding.getLevel() !=
        cc2pJob.levelNumber
    ) {

        CC2P_removeJob(
            cc2pJob.key
        )

        return
    }

    if (
        cc2pServer.persistentData
            .getBoolean(
                cc2pJob.key
            )
    ) {

        CC2P_removeJob(
            cc2pJob.key
        )

        return
    }

    if (
        cc2pJob.targets == null
    ) {

        var cc2pPrepareResult =
            CC2P_prepareJob(
                cc2pServer,
                cc2pJob
            )

        if (
            cc2pPrepareResult ==
            'complete'
        ) {

            CC2P_removeJob(
                cc2pJob.key
            )

            return
        }

        if (
            cc2pPrepareResult ==
            'retry'
        ) {

            var cc2pPrepareDelay =
                CC2P_RETRY_BACKOFF_TICKS[
                    Math.min(
                        cc2pJob.retryIndex,
                        CC2P_RETRY_BACKOFF_TICKS.length - 1
                    )
                ]

            if (
                cc2pJob.retryIndex <
                CC2P_RETRY_BACKOFF_TICKS.length - 1
            ) {
                cc2pJob.retryIndex++
            }

            cc2pJob.nextTick =
                CC2P_runtimeTick +
                cc2pPrepareDelay

            return
        }
    }

    var cc2pTargets =
        cc2pJob.targets

    var cc2pDoneCount = 0
    var cc2pPending = 0
    var cc2pMissing = 0
    var cc2pErrors = 0
    var cc2pProgress = 0
    var cc2pTargetIndex

    for (
        cc2pTargetIndex = 0;
        cc2pTargetIndex <
            cc2pTargets.length;
        cc2pTargetIndex++
    ) {

        var cc2pTarget =
            cc2pTargets[
                cc2pTargetIndex
            ]

        if (
            cc2pTarget.done
        ) {

            cc2pDoneCount++
            continue
        }

        var cc2pResult =
            CC2P_processPosition(
                cc2pServer,
                cc2pJob.level,
                cc2pTarget.pos,
                cc2pTarget.expectedBlockId,
                cc2pJob.profile
            )

        if (
            CC2P_isFinalPositionResult(
                cc2pResult
            )
        ) {

            cc2pTarget.done = true
            cc2pDoneCount++
            cc2pProgress++
            continue
        }

        // An old upgrade-level container position may legitimately have been
        // replaced by a newer plan. Retire only this runtime target; do NOT
        // mark the physical position processed, because the current level may
        // place a different qualifying container at the same coordinates.
        if (
            cc2pResult.startsWith(
                'world_mismatch:'
            ) &&
            cc2pTarget.planLevel <
                cc2pJob.levelNumber
        ) {

            cc2pTarget.done = true
            cc2pDoneCount++
            cc2pProgress++
            continue
        }

        cc2pPending++

        if (
            cc2pResult.startsWith(
                'world_mismatch:'
            ) ||
            cc2pResult ==
                'no_block_entity'
        ) {
            cc2pMissing++
        }

        else {
            cc2pErrors++
        }
    }

    if (
        cc2pDoneCount ==
        cc2pTargets.length
    ) {

        cc2pServer.persistentData
            .putBoolean(
                cc2pJob.key,
                true
            )

        if (
            CC2P_DEBUG
        ) {

            console.info(
                '[CC2 Possessions v5 OPTIMIZED] COMPLETE: ' +
                'culture=' +
                cc2pJob.profile.cultureId +
                ', village=' +
                cc2pJob.profile.villageTypeId +
                ', building=' +
                cc2pJob.profile.buildingId +
                ', level=' +
                cc2pJob.levelNumber +
                ', targets=' +
                cc2pTargets.length
            )
        }

        CC2P_removeJob(
            cc2pJob.key
        )

        return
    }

    // Progress resets the backoff. A completely stuck building backs off
    // progressively until it is checked only once per minute.
    if (
        cc2pProgress > 0
    ) {
        cc2pJob.retryIndex = 0
    }

    var cc2pDelay =
        CC2P_RETRY_BACKOFF_TICKS[
            Math.min(
                cc2pJob.retryIndex,
                CC2P_RETRY_BACKOFF_TICKS.length - 1
            )
        ]

    if (
        cc2pProgress == 0 &&
        cc2pJob.retryIndex <
            CC2P_RETRY_BACKOFF_TICKS.length - 1
    ) {
        cc2pJob.retryIndex++
    }

    cc2pJob.nextTick =
        CC2P_runtimeTick +
        cc2pDelay

    if (
        CC2P_DEBUG
    ) {

        console.info(
            '[CC2 Possessions v5 OPTIMIZED] PENDING: ' +
            'culture=' +
            cc2pJob.profile.cultureId +
            ', village=' +
            cc2pJob.profile.villageTypeId +
            ', building=' +
            cc2pJob.profile.buildingId +
            ', level=' +
            cc2pJob.levelNumber +
            ', cachedTargets=' +
            cc2pTargets.length +
            ', done=' +
            cc2pDoneCount +
            ', pending=' +
            cc2pPending +
            ', missing=' +
            cc2pMissing +
            ', errors=' +
            cc2pErrors +
            ', retryInTicks=' +
            cc2pDelay
        )
    }
}


// ----------------------------------------------------------------------------
// PROCESS A SMALL SLICE OF THE WORK QUEUE
// ----------------------------------------------------------------------------

function CC2P_processWorkQueue(
    cc2pServer
) {

    if (
        CC2P_jobOrder.length == 0
    ) {
        return
    }

    var cc2pProcessedBuildings = 0
    var cc2pExamined = 0
    var cc2pMaxExamined =
        CC2P_jobOrder.length

    while (
        cc2pProcessedBuildings <
            CC2P_MAX_BUILDINGS_PER_WORK_CYCLE &&
        cc2pExamined <
            cc2pMaxExamined &&
        CC2P_jobOrder.length > 0
    ) {

        if (
            CC2P_jobCursor >=
            CC2P_jobOrder.length
        ) {
            CC2P_jobCursor = 0
        }

        var cc2pKey =
            CC2P_jobOrder[
                CC2P_jobCursor
            ]

        CC2P_jobCursor++
        cc2pExamined++

        var cc2pJob =
            CC2P_jobs[
                cc2pKey
            ]

        if (
            cc2pJob == null
        ) {
            continue
        }

        if (
            cc2pJob.nextTick >
            CC2P_runtimeTick
        ) {
            continue
        }

        CC2P_processJob(
            cc2pServer,
            cc2pJob
        )

        cc2pProcessedBuildings++
    }

    CC2P_compactJobOrder()
}


// ----------------------------------------------------------------------------
// SERVER TICK
// ----------------------------------------------------------------------------

ServerEvents.tick(function (event) {

    CC2P_runtimeTick++
    CC2P_workCounter++

    try {

        // Lightweight discovery is deliberately phase-shifted so it does not
        // tend to land on the same tick as the optimized carpet-marker scan.
        if (
            CC2P_runtimeTick %
                CC2P_DISCOVERY_INTERVAL_TICKS ==
            CC2P_DISCOVERY_PHASE_TICKS
        ) {

            CC2P_discoverBuildings(
                event.server
            )
        }

        if (
            CC2P_workCounter >=
            CC2P_WORK_INTERVAL_TICKS
        ) {

            CC2P_workCounter = 0

            CC2P_processWorkQueue(
                event.server
            )
        }
    }

    catch (cc2pMainError) {

        console.error(
            '[CC2 Possessions v5 OPTIMIZED] MAIN ERROR: ' +
            cc2pMainError
        )
    }
})
