// ============================================================================
// CivCraft 2 — Medieval Norman + Palace District Charters
// Put in: kubejs/server_scripts/
//
// FORMAT:
// This deliberately follows the SAME proven structure as fortress_server.js:
//
//   1. Look up Millénaire VillageType
//   2. validateSite(...)
//   3. spawnVillage(...)
//   4. consume charter ONLY after successful spawn
//
// -----------------------------------------------------------------------------
// EXPECTED CUSTOM VILLAGE-TYPE IDS
// -----------------------------------------------------------------------------
//
// These assume you copy/modify the vanilla Norman profession village types
// into the civnormans culture while retaining their vanilla filenames:
//
// Religious:
//   vanilla: millenaire:norman/ecclesiastique
//   custom:  millenaire:civnormans/ecclesiastique
//
// Mercantile:
//   vanilla artisan/guild village:
//   vanilla: millenaire:norman/artisans
//   custom:  millenaire:civnormans/artisans
//
// Agricultural:
//   vanilla: millenaire:norman/agricole
//   custom:  millenaire:civnormans/agricole
//
// Military:
//   vanilla: millenaire:norman/militaire
//   custom:  millenaire:civnormans/militaire
//
// Palace District:
//   custom wrapper expected:
//   millenaire:civnormans/palacedistrict
//
// If you choose another wrapper ID, change ONLY the matching TYPE line below.
// ============================================================================


const $CC2MedievalVillageSpawner =
    Java.loadClass('org.millenaire.world.VillageSpawner')

const $CC2MedievalModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

const $CC2MedievalResourceLocation =
    Java.loadClass('net.minecraft.resources.ResourceLocation')


// ============================================================================
// CONFIG — VILLAGE TYPE IDS
// ============================================================================

const CC2_RELIGIOUS_VILLAGE_TYPE =
    $CC2MedievalResourceLocation.parse(
        'millenaire:civnormans/ecclesiastique'
    )

const CC2_MERCANTILE_VILLAGE_TYPE =
    $CC2MedievalResourceLocation.parse(
        'millenaire:civnormans/artisans'
    )

const CC2_AGRICULTURAL_VILLAGE_TYPE =
    $CC2MedievalResourceLocation.parse(
        'millenaire:civnormans/agricole'
    )

const CC2_MILITARY_VILLAGE_TYPE =
    $CC2MedievalResourceLocation.parse(
        'millenaire:civnormans/militaire'
    )

const CC2_PALACE_DISTRICT_TYPE =
    $CC2MedievalResourceLocation.parse(
        'millenaire:civnormans/settlementpalace'
    )


// ============================================================================
// SHARED CHARTER SPAWNER
//
// This is only a helper to avoid five identical 60-line callbacks.
// The behavior is the same as the Fortress Charter.
// ============================================================================

function cc2FoundCharterVillage(
    event,
    charterLabel,
    villageDisplayName,
    expectedId,
    villageTypeId
) {

    try {

        event.player.tell(
            '§6[' +
            charterLabel +
            '] Surveying this location...'
        )


        // =====================================================================
        // LOOK UP VILLAGE TYPE
        // =====================================================================

        var cc2VillageType =
            $CC2MedievalModCultures.getVillageType(
                villageTypeId
            )


        if (cc2VillageType == null) {

            event.player.tell(
                '§c[' +
                charterLabel +
                '] ' +
                villageDisplayName +
                ' type was not found.'
            )

            event.player.tell(
                '§7Expected: ' +
                expectedId
            )

            event.player.tell(
                '§7The charter was not consumed.'
            )

            return
        }


        // =====================================================================
        // VALIDATE TERRAIN / SITE
        // =====================================================================

        var cc2SiteError =
            $CC2MedievalVillageSpawner.validateSite(
                event.player.serverLevel(),
                event.player.blockPosition(),
                cc2VillageType
            )


        if (cc2SiteError != null) {

            event.player.tell(
                '§cA ' +
                villageDisplayName +
                ' cannot be constructed here.'
            )

            event.player.sendSystemMessage(
                cc2SiteError
            )

            event.player.tell(
                '§7The charter was not consumed.'
            )

            return
        }


        event.player.tell(
            '§a[' +
            charterLabel +
            '] Site accepted.'
        )


        // =====================================================================
        // SPAWN VILLAGE
        // =====================================================================

        var cc2SpawnResult =
            $CC2MedievalVillageSpawner.spawnVillage(
                event.player.serverLevel(),
                event.player.blockPosition(),
                cc2VillageType
            )


        if (cc2SpawnResult != null) {

            event.player.tell(
                '§cThe ' +
                villageDisplayName +
                ' could not be founded here.'
            )

            event.player.sendSystemMessage(
                cc2SpawnResult
            )

            event.player.tell(
                '§7The charter was not consumed.'
            )

            return
        }


        // =====================================================================
        // SUCCESS — CONSUME ONLY NOW
        // =====================================================================

        event.item.count--


        event.player.tell(
            '§6A ' +
            villageDisplayName +
            ' has been founded!'
        )
    }

    catch (e) {

        event.player.tell(
            '§c[' +
            charterLabel +
            '] SCRIPT ERROR:'
        )

        event.player.tell(
            '§c' + e
        )

        console.error(
            '[CivCraft ' +
            charterLabel +
            '] ' +
            e
        )
    }
}


// ============================================================================
// RELIGIOUS VILLAGE CHARTER
// ============================================================================

ItemEvents.rightClicked(
    'kubejs:religious_village_charter',
    event => {

        cc2FoundCharterVillage(
            event,
            'Religious Village Charter',
            'Religious Village',
            'millenaire:civnormans/ecclesiastique',
            CC2_RELIGIOUS_VILLAGE_TYPE
        )
    }
)


// ============================================================================
// MERCANTILE VILLAGE CHARTER
//
// Uses the vanilla Norman "artisans" village as the mercantile/guild-town
// specialization base.
// ============================================================================

ItemEvents.rightClicked(
    'kubejs:mercantile_village_charter',
    event => {

        cc2FoundCharterVillage(
            event,
            'Mercantile Village Charter',
            'Mercantile Village',
            'millenaire:civnormans/artisans',
            CC2_MERCANTILE_VILLAGE_TYPE
        )
    }
)


// ============================================================================
// AGRICULTURAL VILLAGE CHARTER
// ============================================================================

ItemEvents.rightClicked(
    'kubejs:agricultural_village_charter',
    event => {

        cc2FoundCharterVillage(
            event,
            'Agricultural Village Charter',
            'Agricultural Village',
            'millenaire:civnormans/agricole',
            CC2_AGRICULTURAL_VILLAGE_TYPE
        )
    }
)


// ============================================================================
// MILITARY VILLAGE CHARTER
// ============================================================================

ItemEvents.rightClicked(
    'kubejs:military_village_charter',
    event => {

        cc2FoundCharterVillage(
            event,
            'Military Village Charter',
            'Military Village',
            'millenaire:civnormans/militaire',
            CC2_MILITARY_VILLAGE_TYPE
        )
    }
)


// ============================================================================
// PALACE DISTRICT CHARTER
//
// This is a NORMAL Millénaire village/district spawn, not a lone building.
// Its village type should contain the Palace building that carries your
// settlement_palace tag.
// ============================================================================

ItemEvents.rightClicked(
    'kubejs:palace_district_charter',
    event => {

        cc2FoundCharterVillage(
            event,
            'Palace District Charter',
            'Palace District',
            'millenaire:civnormans/settlementpalace',
            CC2_PALACE_DISTRICT_TYPE
        )
    }
)
