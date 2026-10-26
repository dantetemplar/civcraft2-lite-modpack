// CivCraft 2 — Fortress Charter tooltip
// Put in: kubejs/client_scripts/

ItemEvents.modifyTooltips(event => {
    event.add('kubejs:fortress_charter', [
        Text.of('Stand where you wish to establish the fortress.'),
        Text.of('Right-click to found a Fortress.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])
})
