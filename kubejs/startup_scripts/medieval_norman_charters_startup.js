// CivCraft 2 — Medieval Norman + Palace District Charters
// Put in: kubejs/startup_scripts/
//
// Same item format as the working Fortress Charter.

StartupEvents.registry('item', event => {

    event.create('religious_village_charter')
        .displayName('Religious Village Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)

    event.create('mercantile_village_charter')
        .displayName('Mercantile Village Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)

    event.create('agricultural_village_charter')
        .displayName('Agricultural Village Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)

    event.create('military_village_charter')
        .displayName('Military Village Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)

    event.create('palace_district_charter')
        .displayName('Palace District Charter')
        .unstackable()
        .texture('kubejs:item/charter1')
        .glow(true)
})
