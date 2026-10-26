// Visit the wiki for more info - https://kubejs.com/
console.info('Hello, World! (Loaded startup example script)')

StartupEvents.registry('item', event => {
  event.create('food_point')
    .texture('kubejs:item/food_point')
    .displayName('Food Bundle')
    .maxStackSize(64)
    .food(food => {
      food
        .nutrition(8)
        .saturation(0.8)
    })
	
  event.create('animal_fat')
    .displayName('Animal Fat')
    .maxStackSize(64)
    .texture('kubejs:item/animal_fat')
	

})

StartupEvents.registry('item', event => {
    event.create('copper_mine_charter')
        .displayName('Copper Mine Charter')
        .unstackable()
		.texture('kubejs:item/charter1')
        .glow(true)
})



StartupEvents.registry('item', event => {
    event.create('survival_village_charter')
        .displayName('Survival Village Charter')
        .unstackable()
		.texture('kubejs:item/charter1')
        .glow(true)


  const provisions = [
    {
      id: 'grain_provisions',
      name: 'Grain Provisions',
      groupTag: 'civcraft2:grain_provisions'
    },
    {
      id: 'fruit_provisions',
      name: 'Fruit Provisions',
      groupTag: 'civcraft2:fruit_provisions'
    },
    {
      id: 'protein_provisions',
      name: 'Protein Provisions',
      groupTag: 'civcraft2:protein_provisions'
    },
    {
      id: 'vegetable_provisions',
      name: 'Vegetable Provisions',
      groupTag: 'civcraft2:vegetable_provisions'
    }
  ]

  provisions.forEach(provision => {
    event.create(provision.id)
      .displayName(provision.name)
      .maxStackSize(64)
      .texture(`kubejs:item/${provision.id}`)
      .tag('civcraft2:provisions')
      .tag(provision.groupTag)
  })
})