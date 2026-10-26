// CivCraft 2 — Medieval Norman + Palace District Charter tooltips
// Put in: kubejs/client_scripts/

ItemEvents.modifyTooltips(event => {

    event.add('kubejs:religious_village_charter', [
        Text.of('Stand where you wish to establish the village.'),
        Text.of('Right-click to found a Religious Village.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])

    event.add('kubejs:mercantile_village_charter', [
        Text.of('Stand where you wish to establish the village.'),
        Text.of('Right-click to found a Mercantile Village.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])

    event.add('kubejs:agricultural_village_charter', [
        Text.of('Stand where you wish to establish the village.'),
        Text.of('Right-click to found an Agricultural Village.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])

    event.add('kubejs:military_village_charter', [
        Text.of('Stand where you wish to establish the village.'),
        Text.of('Right-click to found a Military Village.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])

    event.add('kubejs:palace_district_charter', [
        Text.of('Stand where you wish to establish the Palace District.'),
        Text.of('Right-click to found a Palace District.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])
})
