// CivCraft 2 — Fortress Charter
// Put in: kubejs/server_scripts/
//
// IMPORTANT:
// This assumes the Millenaire VILLAGE TYPE / wrapper ID for your fortress is:
//   millenaire:civnormans/fortress
//
// If your village-type JSON uses another ID, change CC2_FORTRESS_TYPE below.

const $CC2FortVillageSpawner =
    Java.loadClass('org.millenaire.world.VillageSpawner')

const $CC2FortModCultures =
    Java.loadClass('org.millenaire.culture.ModCultures')

const $CC2FortResourceLocation =
    Java.loadClass('net.minecraft.resources.ResourceLocation')

const CC2_FORTRESS_TYPE =
    $CC2FortResourceLocation.parse(
        'millenaire:civnormans/fortress'
    )

ItemEvents.rightClicked('kubejs:fortress_charter', event => {

    try {

        event.player.tell(
            '§6[Fortress Charter] Surveying this location...'
        )

        var cc2FortressType =
            $CC2FortModCultures.getVillageType(
                CC2_FORTRESS_TYPE
            )

        if (cc2FortressType == null) {

            event.player.tell(
                '§c[Fortress Charter] Fortress type was not found.'
            )

            event.player.tell(
                '§7Expected: millenaire:civnormans/fortress'
            )

            event.player.tell(
                '§7The charter was not consumed.'
            )

            return
        }

        var cc2SiteError =
            $CC2FortVillageSpawner.validateSite(
                event.player.serverLevel(),
                event.player.blockPosition(),
                cc2FortressType
            )

        if (cc2SiteError != null) {

            event.player.tell(
                '§cA Fortress cannot be constructed here.'
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
            '§a[Fortress Charter] Site accepted.'
        )

        var cc2SpawnResult =
            $CC2FortVillageSpawner.spawnVillage(
                event.player.serverLevel(),
                event.player.blockPosition(),
                cc2FortressType
            )

        if (cc2SpawnResult != null) {

            event.player.tell(
                '§cThe Fortress could not be founded here.'
            )

            event.player.sendSystemMessage(
                cc2SpawnResult
            )

            event.player.tell(
                '§7The charter was not consumed.'
            )

            return
        }

        event.item.count--

        event.player.tell(
            '§6A Fortress has been founded!'
        )
    }

    catch (e) {

        event.player.tell(
            '§c[Fortress Charter] SCRIPT ERROR:'
        )

        event.player.tell(
            '§c' + e
        )

        console.error(
            '[CivCraft Fortress Charter] ' + e
        )
    }
})
