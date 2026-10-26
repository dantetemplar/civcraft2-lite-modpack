// CivCraft 2 — Fortress Charter item
// Put in: kubejs/startup_scripts/

StartupEvents.registry('item', event => {
    event.create('fortress_charter')
        .displayName('Fortress Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)
})
