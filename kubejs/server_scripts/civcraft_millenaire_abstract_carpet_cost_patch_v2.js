// ============================================================================
// CIVCRAFT 2 / BILLENAIRE
// ABSTRACT CARPET CONSTRUCTION COST PATCH v2
// Minecraft 1.21.1 / NeoForge / KubeJS / Millenaire 9.0.0-beta.2
//
// Companion for:
//   civcraft_millenaire_mca_easynpc_markers_v5_clean.js
//
// WHAT THIS DOES
// --------------
// v5 deliberately reserves ALL 16 vanilla carpet colors as building metadata.
// Millenaire's NBT cost calculator, however, counts those carpets as ordinary
// construction materials.
//
// v1 tried to compensate by injecting carpet into the Town Hall AFTER a
// BuildingInstance entered construction. That is too late: Millenaire checks
// the LevelDef.requiredResources() map while a project is still PENDING, before
// the BuildingInstance is launched.
//
// v2 fixes the problem at the source:
//
//   LevelDef.requiredResources()
//          |
//          +-- real blocks stay in the cost
//          |
//          +-- all 16 carpet marker entries are removed
//
// The carpets remain in the NBT/placement steps. Millenaire's builder places
// blocks directly from the placement plan; it uses requiredResources() only
// for the economic/fetching check. Therefore the physical carpet marker still
// appears during construction and v5 can consume it after the NPC spawns.
//
// RESULT
// ------
// - Carpets do NOT appear as required construction resources.
// - Villagers do NOT wait for carpet.
// - Builders do NOT fetch/consume carpet.
// - Carpet marker blocks are still placed from the NBT.
// - v5 still sees them and spawns the NPC.
// - No free carpet items are injected into inventories.
//
// IMPORTANT
// ---------
// DELETE / DISABLE:
//   civcraft_millenaire_abstract_carpet_material_helper_v1.js
//
// KEEP:
//   civcraft_millenaire_mca_easynpc_markers_v5_clean.js
//
// Put this file in:
//   kubejs/server_scripts/
// ============================================================================

console.info('[CC2 Abstract Carpet Cost Patch v2] SCRIPT LOADED')

var CC2ACP_MARKERS = {
    'minecraft:white_carpet': true,
    'minecraft:orange_carpet': true,
    'minecraft:magenta_carpet': true,
    'minecraft:light_blue_carpet': true,
    'minecraft:yellow_carpet': true,
    'minecraft:lime_carpet': true,
    'minecraft:pink_carpet': true,
    'minecraft:gray_carpet': true,
    'minecraft:light_gray_carpet': true,
    'minecraft:cyan_carpet': true,
    'minecraft:purple_carpet': true,
    'minecraft:blue_carpet': true,
    'minecraft:brown_carpet': true,
    'minecraft:green_carpet': true,
    'minecraft:red_carpet': true,
    'minecraft:black_carpet': true
}

var $CC2ACP_ModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

var CC2ACP_done = false
var CC2ACP_ticks = 0
var CC2ACP_failureLogged = false


function CC2ACP_patchRequiredResources() {

    var allPlanSets = $CC2ACP_ModCultures.getAllBuildingPlanSets()

    // KubeJS server scripts load while data is reloading. Do not declare
    // success until Millenaire has actually populated its plan-set registry.
    if (allPlanSets == null || allPlanSets.isEmpty()) {
        return false
    }

    var planSetCount = 0
    var levelCount = 0
    var levelsWithMarkers = 0
    var markerEntriesRemoved = 0
    var markerBlocksRemovedFromCost = 0

    var planSetIterator = allPlanSets.entrySet().iterator()

    while (planSetIterator.hasNext()) {

        var planSetEntry = planSetIterator.next()
        var planSet = planSetEntry.getValue()

        if (planSet == null) {
            continue
        }

        planSetCount++

        var variants = planSet.variants()

        if (variants == null || variants.isEmpty()) {
            continue
        }

        var variantIterator = variants.entrySet().iterator()

        while (variantIterator.hasNext()) {

            var variantEntry = variantIterator.next()
            var levels = variantEntry.getValue()

            if (levels == null || levels.isEmpty()) {
                continue
            }

            var levelIterator = levels.iterator()

            while (levelIterator.hasNext()) {

                var levelDef = levelIterator.next()
                levelCount++

                if (levelDef == null) {
                    continue
                }

                var resources = levelDef.requiredResources()

                if (resources == null || resources.isEmpty()) {
                    continue
                }

                // Collect first, then remove. This avoids mutating a Java map
                // while its iterator is active.
                var keysToRemove = []
                var resourceIterator = resources.entrySet().iterator()

                while (resourceIterator.hasNext()) {

                    var resourceEntry = resourceIterator.next()
                    var key = resourceEntry.getKey()
                    var keyString = String(key)

                    if (CC2ACP_MARKERS[keyString] === true) {
                        keysToRemove.push(key)
                    }
                }

                if (keysToRemove.length > 0) {
                    levelsWithMarkers++
                }

                for (var i = 0; i < keysToRemove.length; i++) {

                    var removeKey = keysToRemove[i]
                    var oldAmount = resources.remove(removeKey)

                    if (oldAmount != null) {
                        markerEntriesRemoved++
                        markerBlocksRemovedFromCost += Number(oldAmount)
                    }
                }
            }
        }
    }

    console.info(
        '[CC2 Abstract Carpet Cost Patch v2] PATCHED ' +
        planSetCount + ' plan sets / ' +
        levelCount + ' levels; removed ' +
        markerEntriesRemoved + ' carpet cost entries (' +
        markerBlocksRemovedFromCost + ' marker blocks) from ' +
        levelsWithMarkers + ' levels.'
    )

    console.info(
        '[CC2 Abstract Carpet Cost Patch v2] Carpet remains in NBT placement data; ' +
        'only Millenaire construction COSTS were changed.'
    )

    return true
}


// Patch on the server thread, after Millenaire content has finished loading.
// Retry once per second until the plan-set registry exists. After success this
// becomes a no-op for the rest of the server session.
//
// A /reload reloads server_scripts too, resetting CC2ACP_done and reapplying
// the patch to the freshly loaded Millenaire data.
ServerEvents.tick(function(event) {

    if (CC2ACP_done) {
        return
    }

    CC2ACP_ticks++

    // Try immediately on the first server tick, then once every 20 ticks.
    if (CC2ACP_ticks !== 1 && (CC2ACP_ticks % 20) !== 0) {
        return
    }

    try {

        if (CC2ACP_patchRequiredResources()) {
            CC2ACP_done = true
        }
    }

    catch (error) {

        // Don't silently fail like v1. If Millenaire changes its map type or
        // API, make the reason painfully obvious in latest.log.
        if (!CC2ACP_failureLogged) {
            CC2ACP_failureLogged = true
            console.error(
                '[CC2 Abstract Carpet Cost Patch v2] PATCH FAILED: ' + error
            )
        }
    }
})
