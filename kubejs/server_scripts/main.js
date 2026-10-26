
const $VillageSavedData =
    Java.loadClass('org.millenaire.village.VillageSavedData')

const $VillageSpawner = Java.loadClass('org.millenaire.world.VillageSpawner')
const $ModCultures = Java.loadClass('org.millenaire.culture.ModCultures')
const $ResourceLocation = Java.loadClass('net.minecraft.resources.ResourceLocation')

const $TagKey = Java.loadClass('net.minecraft.tags.TagKey')
const $Registries = Java.loadClass('net.minecraft.core.registries.Registries')
const $MutableBlockPos = Java.loadClass('net.minecraft.core.BlockPos$MutableBlockPos')


    // =========================================================
    // JAVA CLASSES
    // =========================================================

    const $CC2MineVillageSpawner =
        Java.loadClass('org.millenaire.world.VillageSpawner')

    const $CC2MineModCultures =
        Java.loadClass('org.millenaire.culture.ModCultures')

    const $CC2MineVillageSavedData =
        Java.loadClass('org.millenaire.village.VillageSavedData')

    const $CC2MineResourceLocation =
        Java.loadClass('net.minecraft.resources.ResourceLocation')

    const $CC2MineTagKey =
        Java.loadClass('net.minecraft.tags.TagKey')

    const $CC2MineRegistries =
        Java.loadClass('net.minecraft.core.registries.Registries')

    const $CC2MineMutableBlockPos =
        Java.loadClass('net.minecraft.core.BlockPos$MutableBlockPos')


    // =========================================================
    // CONFIG
    // =========================================================

    const CC2_COPPER_MINE_TYPE =
        $CC2MineResourceLocation.parse(
            'millenaire:civnormans/copperminesite'
        )

    // OLD MILLENAIRE LONE-BUILDING EXCLUSION DISTANCE.
    // Copper Mine must be AT LEAST this far from another
    // village or registered lone building.
    const CC2_COPPER_MINE_MIN_DISTANCE = 100.0

    // Copper ore blocks required in the player's current chunk.
    const CC2_COPPER_MINE_REQUIRED_ORE = 12


    // =========================================================
    // COPPER BLOCK TAGS
    // =========================================================

    const CC2_COPPER_POOR =
        $CC2MineTagKey.create(
            $CC2MineRegistries.BLOCK,
            $CC2MineResourceLocation.parse(
                'c:ores/copper/poor'
            )
        )

    const CC2_COPPER_NORMAL =
        $CC2MineTagKey.create(
            $CC2MineRegistries.BLOCK,
            $CC2MineResourceLocation.parse(
                'c:ores/copper/normal'
            )
        )

    const CC2_COPPER_RICH =
        $CC2MineTagKey.create(
            $CC2MineRegistries.BLOCK,
            $CC2MineResourceLocation.parse(
                'c:ores/copper/rich'
            )
        )


    // =========================================================
    // COPPER SURVEY
    //
    // Scans the entire chunk containing the charter position.
    // Stops as soon as enough copper is found.
    // =========================================================

    function cc2SurveyCopperChunk(cc2World, cc2Origin) {

        var cc2ChunkX =
            Math.floor(cc2Origin.getX() / 16)

        var cc2ChunkZ =
            Math.floor(cc2Origin.getZ() / 16)

        var cc2MinX =
            cc2ChunkX * 16

        var cc2MinZ =
            cc2ChunkZ * 16

        var cc2MaxX =
            cc2MinX + 15

        var cc2MaxZ =
            cc2MinZ + 15

        var cc2MinY =
            cc2World.getMinBuildHeight()

        var cc2MaxY =
            cc2World.getMaxBuildHeight()

        var cc2Chunk =
            cc2World.getChunk(
                cc2ChunkX,
                cc2ChunkZ
            )

        var cc2ScanPos =
            new $CC2MineMutableBlockPos()

        var cc2Poor = 0
        var cc2Normal = 0
        var cc2Rich = 0
        var cc2Total = 0


        for (
            var cc2Y = cc2MinY;
            cc2Y < cc2MaxY;
            cc2Y++
        ) {

            for (
                var cc2X = cc2MinX;
                cc2X <= cc2MaxX;
                cc2X++
            ) {

                for (
                    var cc2Z = cc2MinZ;
                    cc2Z <= cc2MaxZ;
                    cc2Z++
                ) {

                    cc2ScanPos.set(
                        cc2X,
                        cc2Y,
                        cc2Z
                    )

                    var cc2State =
                        cc2Chunk.getBlockState(
                            cc2ScanPos
                        )


                    if (
                        cc2State.is(
                            CC2_COPPER_POOR
                        )
                    ) {

                        cc2Poor++
                        cc2Total++
                    }

                    else if (
                        cc2State.is(
                            CC2_COPPER_NORMAL
                        )
                    ) {

                        cc2Normal++
                        cc2Total++
                    }

                    else if (
                        cc2State.is(
                            CC2_COPPER_RICH
                        )
                    ) {

                        cc2Rich++
                        cc2Total++
                    }


                    // Stop immediately once the deposit qualifies.
                    if (
                        cc2Total >=
                        CC2_COPPER_MINE_REQUIRED_ORE
                    ) {

                        return {
                            enough: true,
                            total: cc2Total,
                            poor: cc2Poor,
                            normal: cc2Normal,
                            rich: cc2Rich,
                            chunkX: cc2ChunkX,
                            chunkZ: cc2ChunkZ
                        }
                    }
                }
            }
        }


        return {
            enough: false,
            total: cc2Total,
            poor: cc2Poor,
            normal: cc2Normal,
            rich: cc2Rich,
            chunkX: cc2ChunkX,
            chunkZ: cc2ChunkZ
        }
    }


    // =========================================================
    // COPPER MINE CHARTER
    // =========================================================

    ItemEvents.rightClicked(
        'kubejs:copper_mine_charter',
        event => {

            try {

                event.player.tell(
                    '§6[Survey] Examining this mining claim...'
                )


                // =================================================
                // LOOK UP THE COPPER MINE VILLAGE TYPE
                // =================================================

                var cc2MineVillageType =
                    $CC2MineModCultures.getVillageType(
                        CC2_COPPER_MINE_TYPE
                    )


                if (cc2MineVillageType == null) {

                    event.player.tell(
                        '§c[Copper Mine] Village type was not found.'
                    )

                    event.player.tell(
                        '§7Expected: millenaire:civnormans/coppermine'
                    )

                    return
                }


                // =================================================
                // GET MILLENAIRE SAVED DATA
                // =================================================

                var cc2SavedData =
                    $CC2MineVillageSavedData.get(
                        event.player.serverLevel()
                    )

                var cc2VillageManager =
                    cc2SavedData.getVillageManager()


                // =================================================
                // 100-BLOCK MINIMUM SEPARATION
                //
                // THIS MATCHES MILLENAIRE'S ACTUAL
                // SpawnLoneBuildingCommand LOGIC:
                //
                // if (isWithinMinDistance(pos, 100))
                //     REJECT
                //
                // NO "!" HERE.
                // =================================================

				if (
					cc2VillageManager.isWithinMinDistanceLB(
						event.player.blockPosition(),
						100.0,
						100.0,
						cc2SavedData.getLoneBuildingPositions()
					)
				) {
					event.player.tell(
						'§cA village or lone building already exists within 100 blocks.'
					)

					event.player.tell(
						'§7The Copper Mine charter was not consumed.'
					)

					return
				}


                // =================================================
                // VALIDATE TERRAIN
                // =================================================

                var cc2SiteError =
                    $CC2MineVillageSpawner.validateSite(
                        event.player.serverLevel(),
                        event.player.blockPosition(),
                        cc2MineVillageType
                    )


                if (cc2SiteError != null) {

                    event.player.tell(
                        '§cA Copper Mine cannot be constructed here.'
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
                    '§a[Survey] Construction site accepted.'
                )


                // =================================================
                // GEOLOGICAL SURVEY
                // =================================================

                event.player.tell(
                    '§7[Survey] Searching this chunk for copper...'
                )


                var cc2CopperSurvey =
                    cc2SurveyCopperChunk(
                        event.player.serverLevel(),
                        event.player.blockPosition()
                    )


                event.player.tell(
                    '§7Survey chunk: §f[' +
                    cc2CopperSurvey.chunkX +
                    ', ' +
                    cc2CopperSurvey.chunkZ +
                    ']'
                )


                event.player.tell(
                    '§7Copper ore detected: §f' +
                    cc2CopperSurvey.total +
                    '§7 / §f' +
                    CC2_COPPER_MINE_REQUIRED_ORE
                )


                // =================================================
                // NOT ENOUGH COPPER
                // =================================================

                if (!cc2CopperSurvey.enough) {

                    event.player.tell(
                        '§cNo commercially workable copper deposit was found.'
                    )

                    event.player.tell(
                        '§7Try surveying another chunk.'
                    )

                    event.player.tell(
                        '§7The charter was not consumed.'
                    )

                    return
                }


                // =================================================
                // COPPER CONFIRMED
                // =================================================

                event.player.tell(
                    '§aA workable copper deposit has been discovered!'
                )


                // =================================================
                // SPAWN THE LONE BUILDING
                //
                // We call VillageSpawner directly instead of
                // /millenaire spawn_lb.
                //
                // That lets THIS script control the 100-block rule.
                // =================================================

                var cc2SpawnResult =
                    $CC2MineVillageSpawner.spawnVillage(
                        event.player.serverLevel(),
                        event.player.blockPosition(),
                        cc2MineVillageType,
                        0
                    )


                if (cc2SpawnResult != null) {

                    event.player.tell(
                        '§cThe Copper Mine could not be founded here.'
                    )

                    event.player.sendSystemMessage(
                        cc2SpawnResult
                    )

                    event.player.tell(
                        '§7The charter was not consumed.'
                    )

                    return
                }


                // =================================================
                // REGISTER AS A MILLENAIRE LONE BUILDING
                //
                // Verified beta.2 signature:
                //
                // registerLoneBuilding(
                //     BlockPos,
                //     ResourceLocation,
                //     String culturePath,
                //     String customName
                // )
                // =================================================

                cc2SavedData.registerLoneBuilding(
                    event.player.blockPosition(),
                    CC2_COPPER_MINE_TYPE,
                    cc2MineVillageType
                        .culture()
                        .getPath(),
                    null
                )


                // =================================================
                // SUCCESS
                // =================================================

                event.item.count--


                event.player.tell(
                    '§6Copper Mine founded!'
                )
            }

            catch (e) {

                event.player.tell(
                    '§c[Copper Mine Charter] SCRIPT ERROR:'
                )

                event.player.tell(
                    '§c' + e
                )

                console.error(
                    '[CivCraft Copper Mine Charter] ' + e
                )
            }
        }
    )



const SURVIVAL_VILLAGE =
    $ResourceLocation.parse('millenaire:civnormans/survivalvillage')



ItemEvents.rightClicked('kubejs:survival_village_charter', event => {

    event.player.tell('§7[Charter] Checking this location...')

    try {

        event.player.tell('§7[Charter] Looking up village type...')

        var civcraftVillageType =
            $ModCultures.getVillageType(SURVIVAL_VILLAGE)

        if (civcraftVillageType == null) {
            event.player.tell('§c[Charter] Survival Village type was not found.')
            return
        }

        event.player.tell('§7[Charter] Village type found.')

        var civcraftSpawnResult =
            $VillageSpawner.spawnVillage(
                event.player.serverLevel(),
                event.player.blockPosition(),
                civcraftVillageType
            )

        if (civcraftSpawnResult != null) {
            event.player.tell('§cThe village could not be founded here.')
            event.player.sendSystemMessage(civcraftSpawnResult)
            event.player.tell('§7The charter was not consumed.')
            return
        }

        event.item.count--

        event.player.tell('§aA Survival Village has been founded!')
    }
    catch (e) {
        event.player.tell('§c[Charter] SCRIPT ERROR:')
        event.player.tell('§c' + e)

        console.error('[CivCraft Charter] ' + e)
    }
})



ServerEvents.tags('item', event => {
	event.add('civcraft2:provisions', [
		'kubejs:grain_provisions',
		'kubejs:fruit_provisions',
		'kubejs:protein_provisions',
		'kubejs:vegetable_provisions',
	])
})
	
PlayerEvents.loggedIn(event => {
    const player = event.player
    const data = player.persistentData

    if (!data.getBoolean('civcraft_received_quest_book')) {
        player.give('ftbquests:book')
        data.putBoolean('civcraft_received_quest_book', true)
    }
})


// CivCraft 2 — Remove every normal crafting-table recipe
// that produces vanilla paper.

ServerEvents.recipes(event => {
  event.remove({
    type: 'minecraft:crafting_shaped',
    output: 'minecraft:paper'
  })

  event.remove({
    type: 'minecraft:crafting_shapeless',
    output: 'minecraft:paper'
  })

  event.remove({
    id: 'immersiveengineering:crafting/paper_from_sawdust'
  })
  
  const woodTypes = [
    'acacia',
    'ash',
    'aspen',
    'birch',
    'blackwood',
    'chestnut',
    'douglas_fir',
    'hickory',
    'kapok',
    'mangrove',
    'maple',
    'oak',
    'palm',
    'pine',
    'rosewood',
    'sequoia',
    'spruce',
    'sycamore',
    'white_cedar',
    'willow'
  ]

  woodTypes.forEach(wood => {
    event.remove({
      id: `tfc:crafting/wood/lumber/${wood}_from_planks`
    })
  })
})

// Fires cobblestone into smooth stone
ServerEvents.recipes(event => {
  event.recipes.tfc.heating(
    'minecraft:cobblestone',
    1300
  )
    .resultItem('minecraft:stone')
    .id('civcraft2:heating/cobblestone_to_smooth_stone')
})


BlockEvents.rightClicked('supplementaries:timber_frame', event => {
  // Only activate while the player is holding Shift
  if (!event.player.isCrouching()) return

  const itemId = String(event.item.id)

  // Accept only TFC lumber:
  // tfc:wood/lumber/oak
  // tfc:wood/lumber/hickory
  // etc.
  const lumberMatch = /^tfc:wood\/lumber\/([a-z0-9_]+)$/.exec(itemId)

  if (!lumberMatch) return

  const woodType = lumberMatch[1]
  const plankBlock = `tfc:wood/planks/${woodType}`

  // Replace the frame with matching planks
  event.block.set(plankBlock)

  // Consume one lumber unless in creative mode
  if (!event.player.isCreative()) {
    event.item.shrink(1)
  }

  event.cancel()
})


const tfcHammers = Ingredient.of('#c:tools/hammer')

BlockEvents.rightClicked(event => {
  const blockId = String(event.block.id)
  const itemId = String(event.item.id)

  // ---------------------------------------------------------
  // STEP 1:
  // Hammer a vanilla or TFC dirt path into packed mud
  // ---------------------------------------------------------

  const isDirtPath =
    blockId === 'minecraft:dirt_path' ||
    /^tfc:grass_path\/[a-z0-9_]+$/.test(blockId) ||
    /^tfc:dirt_path\/[a-z0-9_]+$/.test(blockId)

  if (isDirtPath && tfcHammers.test(event.item)) {
    event.block.set('minecraft:packed_mud')
    event.cancel()
    return
  }

  // ---------------------------------------------------------
  // STEP 2:
  // Use two matching TFC lumber pieces on packed mud
  // to construct the corresponding plank block
  // ---------------------------------------------------------

  if (blockId !== 'minecraft:packed_mud') return
  if (event.item.count < 2) return

  const lumberMatch =
    /^tfc:wood\/lumber\/([a-z0-9_]+)$/.exec(itemId)

  if (!lumberMatch) return

  const woodType = lumberMatch[1]
  const plankBlock = `tfc:wood/planks/${woodType}`

  // Replace the packed mud foundation with the plank floor
  event.block.set(plankBlock)

  // Consume exactly two pieces of lumber
  event.item.count -= 3

  event.cancel()
})



LootJS.modifiers(event => {
  const fatDrop = (chance, min, max) => {
    return LootEntry
      .of('kubejs:animal_fat', [min, max])
      .when(conditions => conditions.randomChance(chance))
  }

  // Pigs and boars
  event.addEntityModifier([
    'tfc:pig',
    'tfc:boar',
    'minecraft:pig'
  ]).addLoot(fatDrop(1.00, 2, 4))

  // Large cattle-like animals
  event.addEntityModifier([
    'tfc:cow',
    'tfc:yak',
    'tfc:musk_ox',
    'tfc:bison',
    'tfc:moose',
    'minecraft:cow'
  ]).addLoot(fatDrop(0.80, 1, 3))

  // Medium livestock
  event.addEntityModifier([
    'tfc:sheep',
    'tfc:goat',
    'tfc:alpaca',
    'tfc:caribou',
    'tfc:wildebeest',
    'minecraft:sheep',
    'minecraft:goat'
  ]).addLoot(fatDrop(0.65, 1, 2))

  // Lean wild animals
  event.addEntityModifier([
    'tfc:deer',
    'tfc:bongo',
    'tfc:gazelle'
  ]).addLoot(fatDrop(0.35, 1, 1))

  // Bears
  event.addEntityModifier([
    'tfc:polar_bear',
    'tfc:grizzly_bear',
    'tfc:black_bear',
    'minecraft:polar_bear'
  ]).addLoot(fatDrop(0.85, 2, 4))
})






TFCEvents.data(event => {
	
	
	  event.heat({
    ingredient: 'minecraft:cobblestone',

    // Higher values make the item heat more slowly.
    heatCapacity: 1.0
  }, 'civcraft2:cobblestone_heat')
	
	
	
	
  event.food({
    ingredient: 'extradelight:jerky',

    food: {
      hunger: 8,
      saturation: 4,
      water: 0,

      // Order:
      // grain, fruit, vegetables, protein, dairy
      nutrients: [
        0,
        0,
        0,
        4,
        0
      ],

      // Lower = slower decay.
      // 0.25 gives it one-quarter the normal decay rate.
      decayModifier: 0.25
    },

    edible: true
  }, 'civcraft2:extradelight_jerky')

})

// CivCraft 2 - Food Bundle Unpacking
//
// One Food Bundle gives THREE DIFFERENT provisions.
// Exactly one of the four food groups is randomly missing.

ItemEvents.rightClicked('kubejs:food_point', event => {
    const player = event.player
	
	event.item.count--

const foodGroups = {
    grain: [
        'tfc:food/barley_bread',
        'tfc:food/maize_bread',
        'tfc:food/oat_bread',
        'tfc:food/rice_bread',
        'tfc:food/rye_bread',
        'tfc:food/wheat_bread',
        'minecraft:bread'
    ],

    fruit: [
        'tfc:food/banana',
        'tfc:food/cherry',
        'tfc:food/green_apple',
        'tfc:food/red_apple',
        'tfc:food/lemon',
        'tfc:food/orange',
        'tfc:food/peach',
        'tfc:food/plum',
        'tfc:food/blackberry',
        'tfc:food/raspberry',
        'tfc:food/blueberry',
        'tfc:food/strawberry',
        'minecraft:apple',
        'minecraft:sweet_berries',
        'minecraft:melon_slice'
    ],

    vegetable: [
        'tfc:food/beet',
        'tfc:food/cabbage',
        'tfc:food/carrot',
        'tfc:food/garlic',
        'tfc:food/green_bean',
        'tfc:food/onion',
        'tfc:food/potato',
        'tfc:food/squash',
        'tfc:food/tomato',
        'tfc:food/radish',
        'farmersdelight:cabbage',
        'farmersdelight:tomato',
        'farmersdelight:onion',
        'minecraft:carrot',
        'minecraft:potato',
        'minecraft:beetroot'
    ],

    protein: [
        'tfc:food/cooked_beef',
        'tfc:food/cooked_pork',
        'tfc:food/cooked_chicken',
        'tfc:food/cooked_mutton',
        'tfc:food/cooked_venison',
        'tfc:food/cooked_rabbit',
        'tfc:food/cooked_cod',
        'tfc:food/cooked_salmon',
        'farmersdelight:cooked_bacon',
        'farmersdelight:beef_patty',
        'farmersdelight:cooked_chicken_cuts',
        'farmersdelight:cooked_cod_slice',
        'farmersdelight:cooked_salmon_slice',
        'minecraft:cooked_beef',
        'minecraft:cooked_porkchop',
        'minecraft:cooked_chicken',
        'minecraft:cooked_mutton'
    ]
}

// Make a list of the four group names
let groups = ['grain', 'fruit', 'vegetable', 'protein']

// Shuffle the group list
for (let i = groups.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1))

    let temp = groups[i]
    groups[i] = groups[j]
    groups[j] = temp
}

// Take exactly THREE DIFFERENT groups
let chosenGroups = groups.slice(0, 3)

// Pick exactly ONE random food from each chosen group
chosenGroups.forEach(groupName => {
    let foods = foodGroups[groupName]

    let randomFood = foods[
        Math.floor(Math.random() * foods.length)
    ]

    player.give(randomFood)
})

	

    // Stop any normal right-click behavior.
    event.cancel()
})

ServerEvents.recipes(event => {
	
  const bladder = 'waterflasks:bladder'

  const brainTanningRecipes = [
    {
      hide: 'tfc:small_raw_hide',
      leather: 1,
      name: 'small'
    },
    {
      hide: 'tfc:medium_raw_hide',
      leather: 2,
      name: 'medium'
    },
    {
      hide: 'tfc:large_raw_hide',
      leather: 3,
      name: 'large'
    }
  ]

  for (const recipe of brainTanningRecipes) {
    event.shapeless(
      Item.of('minecraft:leather', recipe.leather),
      [
        recipe.hide,
        bladder
      ]
    ).id(`civcraft2:brain_tanning/${recipe.name}_hide`)
  }
	
	
	  const hides = [
    {
      size: 'small',
      tannin: 300,
      leather: 2
    },
    {
      size: 'medium',
      tannin: 400,
      leather: 4
    },
    {
      size: 'large',
      tannin: 500,
      leather: 6
    }
  ]

  for (const hide of hides) {
    // Remove TFC's original tanning recipe
    event.remove({
      id: `tfc:barrel/${hide.size}_leather`
    })

    // Add CivCraft's more efficient tannin tanning
    event.recipes.tfc.sealed_barrel(
      Fluid.of('tfc:tannin', hide.tannin),
      7200
    )
      .inputItem(`tfc:${hide.size}_prepared_hide`)
      .outputItem(Item.of('minecraft:leather', hide.leather))
      .id(`civcraft2:barrel/${hide.size}_leather`)
  }


  event.recipes.tfc.pot(
    [
      'kubejs:animal_fat',
      'kubejs:animal_fat',
      'kubejs:animal_fat',
      'kubejs:animal_fat',
      'kubejs:animal_fat'
    ],
    Fluid.water(1000),
    2400,
    600
  )
    .fluidOutput(Fluid.of('tfc:tallow', 1000))
    .id('civcraft2:pot/render_animal_fat')





  event.shapeless(
    'kubejs:food_point',
    [
      '#c:foods/grain',
      '#c:foods/vegetable',
      '#c:foods/fruit',
      '#c:foods/cooked_meat'
    ]
  ).id('civcraft2:food_point')

  
    event.custom({
    type: 'extradelight:drying_rack',

    cookingtime: 1000,
    experience: 0.1,

    ingredient: {
      item: 'tfc_items:plant_fabric'
    },

    result: {
      id: 'farmersdelight:canvas',
      count: 1
    }
  }).id('civcraft2:drying/plant_fabric_to_canvas')
  
  
  
      event.custom({
    type: 'extradelight:drying_rack',

    cookingtime: 800,
    experience: 0.1,

    ingredient: {
      item: 'tfc_items:plant_fiber_block'
    },

    result: {
      id: 'tfc:thatch',
      count: 1
    }
  }).id('civcraft2:drying/dryingthatch')
  
    event.custom({
    type: 'extradelight:mortar',

    grinds: 8,

    ingredient: {
      item: 'minecraft:charcoal'
    },

    result: {
      id: 'tfc:powder/charcoal',
      count: 2
    },

    fluidOut: {}
  }).id('civcraft2:mortarcharcoal')
  
    event.shapeless(
    'supplementaries:rope',
    ['farmersdelight:rope']
  ).id('civcraft2:ropeconversion')
  
  
      event.shapeless(
    'farmersdelight:rope',
    ['supplementaries:rope']
  ).id('civcraft2:ropeconversion2')

  event.shaped(
    'tfc_items:plant_fabric',
    [
      'SS',
      'SS'
    ],
    {
      S: 'farmersdelight:straw'
    }
  ).id('civcraft2:straw_to_plant_fabric')


  const tfcCobblestoneBlocks = Ingredient.of(
    /^tfc:rock\/cobble\/(granite|diorite|gabbro|shale|claystone|limestone|conglomerate|dolomite|chert|chalk|rhyolite|basalt|andesite|dacite|quartzite|slate|phyllite|schist|gneiss|marble)$/
  )

  event.shaped(
    'minecraft:cobblestone',
    [
      'CC',
      'CC'
    ],
    {
      C: tfcCobblestoneBlocks
    }
  ).id('civcraft2:tfc_cobblestone_to_vanilla_cobblestone')
  
    event.shaped(
    'extradelight:drying_rack_item',
    [
      'SC',
      'CS'
    ],
    {
      C: 'tfc_items:leather_strap',
	  S: 'minecraft:stick'
    }
  ).id('civcraft2:tfc_drying_rack_leather')
  
  
  event.shaped(
    'millenaire:straw_bed',
    [
      'SS'
    ],
    {
      S: 'farmersdelight:straw'
    }
  ).id('civcraft2:straw_bed')
  
  event.shaped(
    'farmersdelight:straw',
    [
      'SS'
    ],
    {
      S: 'tfc:straw'
    }
  ).id('civcraft2:straw')
  
  event.remove({ id: 'survivorsdelight:crafting/fd_straw2tfc_straw' })
  event.remove({ id: 'farmersdelight:wooden_basket' })
  event.remove({ id: 'tfc_items:crafting/plant_string_from_plant_fabric' })
  event.remove({ id: 'extradelight:drying_rack' })
  event.remove({ id: 'waterflasks:crafting/leather_flask' })
  event.remove({ id: 'waterflasks:crafting/leather_flask_rotated' })
  event.remove({ id: 'supplementaries:sack' })
  event.remove({ id: 'supplementaries:sack_3' })
  event.remove({ id: 'tfc_items:crafting/long_stick' })
  event.remove({ id: 'tfc:crafting/thatch' })
  event.remove({ id: 'extradelight:mortar_stone'})
  event.remove({ id: 'tfc:crafting/stick_from_bundle'})
  event.remove({ id: 'tfc:crafting/stick_from_bunch'})
  event.remove({ id: 'tfc:crafting/stone/hoe/sedimentary'})
  event.remove({ id: 'tfc:crafting/stone/hoe/metamorphic'})
  event.remove({ id: 'tfc:crafting/stone/hoe/igneous_extrusive'})
  event.remove({ id: 'tfc:crafting/stone/hoe/igneous_intrusive'})
  event.remove({ id: 'minecraft:mud_bricks'})
  event.remove({ id: 'mekanism:cardboard_box'})
  event.remove({ id: 'supplementaries:timber_frame'})
  event.remove({ id: 'horsepowered:crafting/chopping_block'})
  
  event.shaped(
    'extradelight:mortar_stone',
    [
      'S ',
      ' S'
    ],
    {
      S: 'minecraft:stone'
    }
  ).id('civcraft2:stone_age_mortar')
  
  
    event.shaped(
    'tfc:stone/hoe/sedimentary',
    [
      'NC',
      'BS'
    ],
    {
      S: 'minecraft:stick',
	  C: 'tfc:stone/hoe_head/sedimentary',
	  N: 'minecraft:string',
	  B: 'tfc_items:leather_strap'
    }
  ).id('civcraft2:stone_hoe_sedimentary')
  
  
      event.shaped(
    'tfc:stone/hoe/metamorphic',
    [
      'NC',
      'BS'
    ],
    {
      S: 'minecraft:stick',
	  C: 'tfc:stone/hoe_head/metamorphic',
	  N: 'minecraft:string',
	  B: 'tfc_items:leather_strap'
    }
  ).id('civcraft2:stone_hoe_metamorphic')
  
        event.shaped(
    'tfc:stone/hoe/igneous_extrusive',
    [
      'NC',
      'BS'
    ],
    {
      S: 'minecraft:stick',
	  C: 'tfc:stone/hoe_head/igneous_extrusive',
	  N: 'minecraft:string',
	  B: 'tfc_items:leather_strap'
    }
  ).id('civcraft2:stone_hoe_igneous_extrusive')
  
        event.shaped(
    'tfc:stone/hoe/igneous_intrusive',
    [
      'NC',
      'BS'
    ],
    {
      S: 'minecraft:stick',
	  C: 'tfc:stone/hoe_head/igneous_intrusive',
	  N: 'minecraft:string',
	  B: 'tfc_items:leather_strap'
    }
  ).id('civcraft2:stone_hoe_igneous_intrusive')
  
  
  
  
  
    const hideGlueRecipes = [
    {
      hide: 'tfc:small_raw_hide',
      glue: 1,
      name: 'small'
    },
    {
      hide: 'tfc:medium_raw_hide',
      glue: 2,
      name: 'medium'
    },
    {
      hide: 'tfc:large_raw_hide',
      glue: 3,
      name: 'large'
    }
  ]

  for (const recipe of hideGlueRecipes) {
    event.recipes.tfc.pot(
      [recipe.hide],           // One raw hide
      Fluid.water(1000),       // 1 bucket of water
      6000,                    // Five minutes at 20 ticks per second
      100                      // Must reach boiling temperature
    )
      .itemOutput([
        Item.of('tfc:glue', recipe.glue)
      ])
      .id(`civcraft2:pot/${recipe.name}_hide_glue`)
  }
  
  
  
    event.shapeless(
    'minecraft:string',
    [
      '3x tfc_items:plant_string',
      '#c:tools/spindle'
    ]
  )
    .keepIngredient('#c:tools/spindle')
    .id('civcraft2:spindle_string')
  
  
  
      event.shaped(
    'extradelight:drying_rack_item',
    [
      'SC',
      'CS'
    ],
    {
      S: 'minecraft:stick',
      C: 'minecraft:string'
    }
  ).id('civcraft2:drying_rack')
  
        event.shaped(
    '12x minecraft:torch',
    [
      'NC',
      ' S'
    ],
    {
      S: 'tfc:stick_bunch',
      C: 'tfc:powder/charcoal',
	  N: 'tfc:glue'
    }
	).id('civcraft2:vanillatorch')
	
	
	event.shaped(
    'tfc:stick_bunch',
    [
      'SS',
      'SS'
    ],
    {
      S: 'minecraft:stick'
    }
	).id('civcraft2:stickbunch')
  
        event.shaped(
    '9x millenaire:thatch',
    [
      'SSS',
      'SSS',
	  'SSS'
    ],
    {
      S: 'tfc:thatch'
      
    }
  ).id('civcraft2:millthatch')
  
  
  
          event.shaped(
    '16x supplementaries:timber_frame',
    [
      ' S ',
      'S S',
	  ' S '
    ],
    {
      S: 'minecraft:stick'
      
    }
  ).id('civcraft2:timberframeboost')
  
  
  
  
  
  
  
  
  
  
        event.shaped(
    'waterflasks:leather_flask',
    [
      'SC',
      'CN'
    ],
    {
      S: 'waterflasks:bladder',
      N: 'minecraft:string',
	  C: 'waterflasks:leather_side'
    }
  ).id('civcraft2:leather_flask')
  
  
          event.shaped(
    'supplementaries:sack',
    [
      'SC',
      'CC'
    ],
    {
      C: 'farmersdelight:canvas',
      S: 'minecraft:string'
    }
  ).id('civcraft2:sack')
  
  
  
    event.shaped(
    'farmersdelight:wooden_basket',
    [
      'SC',
      'CS'
    ],
    {
      S: 'minecraft:stick',
      C: 'farmersdelight:canvas'
    }
  ).id('civcraft2:primitive_basket')

  event.shapeless(
    'millenaire:mud_brick',
    [
      Ingredient.of([
        'minecraft:mud_bricks',
        '#tfc:mud_bricks'
      ])
    ]
  ).id('civcraft2:millenaire_mud_bricks_conversion')
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
})