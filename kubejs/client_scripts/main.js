// Visit the wiki for more info - https://kubejs.com/
console.info('Hello, World! (Loaded client example script)')

ItemEvents.modifyTooltips(event => {
    event.add('kubejs:survival_village_charter', [
        Text.of('Stand where you wish to establish your settlement.'),
        Text.of('Right-click to found a Survival Village.'),
        Text.of('The charter is not consumed if the location is unsuitable.')
    ])
})