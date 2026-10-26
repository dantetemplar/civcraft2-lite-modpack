// CIVCRAFT 2 - INTERNAL MILLAGER LABOR ITEM
// Requires a FULL Minecraft restart after installation.
// This is a machine-readable heartbeat produced by Millenaire crafting goals.
// It is NOT stored energy and should not be given to players in normal play.

StartupEvents.registry('item', event => {

    event.create('crank_labor')
        .displayName('Crank Labor (Internal)')
        .maxStackSize(64)
        .texture('minecraft:item/paper')
})
