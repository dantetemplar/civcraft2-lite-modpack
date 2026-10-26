// ============================================================
// CivCraft 2 — Civilization / Capitol Center v0.6 ABILITY-ROLLUP
// SERVER SCRIPT
// Put in: kubejs/server_scripts/
//
// HIERARCHY
// ------------------------------------------------------------
// Building
//   -> Millenaire Village/Lone Building = District
//      -> Palace = Settlement
//         -> Capitol Center = Civilization
//
// A Capitol Center NEVER owns districts directly.
// It owns WHOLE Palace settlements.
//
// INDUSTRIAL AGE
// ------------------------------------------------------------
// This script registers no recipe/unlock.
// Gate kubejs:civilization_ledger and the Capitol Center building
// through your Industrial Age quest/stage later.
//
// CAPITOL CENTER BUILDING
// ------------------------------------------------------------
// Put this TOP-LEVEL tag on its BuildingPlanSet:
//
//   "tags": [
//       "civilization_capitol_center"
//   ]
//
// Recommended building_id:
//   capitolcenter
// ============================================================

(() => {

    const $CC2CivVillageSavedData =
        Java.loadClass('org.millenaire.village.VillageSavedData')

    const $CC2CivModCultures =
        Java.loadClass('org.millenaire.culture.ModCultures')

    const $CC2CivVillageId =
        Java.loadClass('org.millenaire.village.VillageId')

    const $CC2CivUUID =
        Java.loadClass('java.util.UUID')

    const $CC2CivBlockPos =
        Java.loadClass('net.minecraft.core.BlockPos')

    const $CC2CivSignBlockEntity =
        Java.loadClass('net.minecraft.world.level.block.entity.SignBlockEntity')

    const $CC2CivSignText =
        Java.loadClass('net.minecraft.world.level.block.entity.SignText')

    const $CC2CivComponent =
        Java.loadClass('net.minecraft.network.chat.Component')


    // ========================================================
    // CONFIG
    // ========================================================

    const CC2CIV_DATA_KEY =
        'civcraft2_settlement_system_v1'

    const CC2CIV_PLAYER_SELECTED_KEY =
        'civcraft2_selected_civilization_v1'

    const CC2CIV_CAPITOL_TAG =
        'civilization_capitol_center'

    const CC2CIV_DISTRICT_LOOKUP_RADIUS =
        192.0

    // Palace origins must be inside this radius to join the civ.
    // This is intentionally MUCH larger than a Palace's 2048-block
    // district radius.
    const CC2CIV_CAPITOL_SETTLEMENT_RADIUS =
        8192.0

    const CC2CIV_SIGN_BIND_RADIUS =
        384.0

    const CC2CIV_SIGN_REFRESH_TICKS =
        200

    const CC2CIV_LOG_PREFIX =
        '[CC2 Civilization Core] '

    var CC2CIV_TICK_COUNTER = 0


    const CC2CIV_SIGN_CHANNELS = [
        'overview',
        'settlements',
        'population',
        'districts',
        'food',
        'security',
        'industry',
        'logistics',
        'treasury',
        'infrastructure',
        'research',
        'policy',
        'project'
    ]


    // ========================================================
    // SAME STARTER BUILDING BALANCE AS SETTLEMENT CORE
    // ========================================================

    const CC2CIV_BUILDING_STAT_RULES = {

        'millenaire:civnormans/palace': {
            security_supply: 12,
            logistics_capacity: 16,
            housing_capacity: 6,
            commerce: 4,
            administration_supply: 40
        },

        'millenaire:civnormans/foragershut': {
            food_supply: 10,
            logistics_demand: 1,
            tools_demand: 1
        },

        'millenaire:civnormans/kitchen': {
            food_supply: 8,
            food_service: 24,
            fuel_demand: 2,
            logistics_demand: 1
        },

        'millenaire:civnormans/kiln': {
            industry_supply: 8,
            ceramics_supply: 10,
            fuel_demand: 4,
            tools_demand: 1
        },

        'millenaire:civnormans/lumberjackhut': {
            timber_supply: 16,
            fuel_supply: 12,
            tools_demand: 2,
            logistics_demand: 2
        },

        'millenaire:civnormans/lumberjack': {
            timber_supply: 16,
            fuel_supply: 12,
            tools_demand: 2,
            logistics_demand: 2
        },

        'millenaire:civnormans/coppermine': {
            copper_supply: 14,
            industry_supply: 8,
            tools_demand: 3,
            logistics_demand: 3
        },

        'millenaire:civnormans/workshop': {
            tools_supply: 10,
            industry_supply: 10,
            fuel_demand: 2,
            logistics_demand: 1
        },

        'millenaire:civnormans/fortress': {
            security_supply: 36,
            housing_capacity: 8,
            food_demand: 8,
            tools_demand: 3,
            logistics_demand: 4
        },

        'millenaire:civnormans/town_hovel': {
            housing_capacity: 5
        },

        'millenaire:civnormans/townhovel': {
            housing_capacity: 5
        },

        'millenaire:civnormans/meetinghall': {
            housing_capacity: 4,
            security_supply: 3,
            logistics_capacity: 4,
            administration_supply: 10
        },

        'millenaire:civnormans/survivalmeetinghall': {
            housing_capacity: 4,
            security_supply: 3,
            logistics_capacity: 4,
            administration_supply: 10
        },

        'millenaire:civnormans/well': {
            health_supply: 6,
            sanitation_supply: 8
        },

        'millenaire:civnormans/grove': {
            timber_supply: 6,
            fuel_supply: 4,
            food_supply: 2
        }
    }


    // ========================================================
    // DATABASE
    // ========================================================

    function cc2civEnsureSettlementShape(settlement) {

        if (settlement.districts == null) {
            settlement.districts = {}
        }

        if (settlement.signs == null) {
            settlement.signs = {}
        }

        if (settlement.values == null) {
            settlement.values = {}
        }

        if (settlement.civilizationId == null) {
            settlement.civilizationId = ''
        }

        if (settlement.addonStats == null) {
            settlement.addonStats = {}
        }

        if (settlement.addonAbilities == null) {
            settlement.addonAbilities = []
        }

        if (settlement.addonBreakdown == null) {
            settlement.addonBreakdown = {}
        }

        if (settlement.abilityStats == null) {
            settlement.abilityStats = {}
        }

        if (settlement.abilityCooldowns == null) {
            settlement.abilityCooldowns = {}
        }

        if (settlement.activeAbilities == null) {
            settlement.activeAbilities = {}
        }

        return settlement
    }


    function cc2civEnsureCivilizationShape(civ) {

        if (civ.settlements == null) {
            civ.settlements = {}
        }

        if (civ.signs == null) {
            civ.signs = {}
        }

        if (civ.values == null) {
            civ.values = {}
        }

        if (civ.values.treasury == null) {
            civ.values.treasury = 0
        }

        if (civ.values.infrastructure == null) {
            civ.values.infrastructure = 0
        }

        if (civ.values.research == null) {
            civ.values.research = 0
        }

        if (civ.values.legitimacy == null) {
            civ.values.legitimacy = 0
        }

        if (civ.values.policy == null) {
            civ.values.policy = 'Default'
        }

        if (civ.values.project == null) {
            civ.values.project = 'None'
        }

        // v0.5.1 modular extension buckets.
        if (civ.addonStats == null) {
            civ.addonStats = {}
        }

        if (civ.addonAbilities == null) {
            civ.addonAbilities = []
        }

        if (civ.addonBreakdown == null) {
            civ.addonBreakdown = {}
        }

        if (civ.administrativeRadius == null) {
            civ.administrativeRadius =
                CC2CIV_CAPITOL_SETTLEMENT_RADIUS
        }

        return civ
    }


    function cc2civLoadDatabase(server) {

        try {

            var raw =
                server.persistentData.getString(
                    CC2CIV_DATA_KEY
                )

            var db

            if (
                raw == null ||
                String(raw).trim() === ''
            ) {

                db = {
                    version: 5,
                    settlements: {},
                    civilizations: {}
                }
            }

            else {

                db =
                    JSON.parse(
                        String(raw)
                    )
            }


            if (db.settlements == null) {
                db.settlements = {}
            }

            if (db.civilizations == null) {
                db.civilizations = {}
            }


            var settlementIds =
                Object.keys(
                    db.settlements
                )

            for (
                var i = 0;
                i < settlementIds.length;
                i++
            ) {

                cc2civEnsureSettlementShape(
                    db.settlements[
                        settlementIds[i]
                    ]
                )
            }


            var civIds =
                Object.keys(
                    db.civilizations
                )

            for (
                var c = 0;
                c < civIds.length;
                c++
            ) {

                cc2civEnsureCivilizationShape(
                    db.civilizations[
                        civIds[c]
                    ]
                )
            }


            db.version = 5

            return db
        }

        catch (e) {

            console.error(
                CC2CIV_LOG_PREFIX +
                'Could not read shared civic database: ' +
                e
            )

            return {
                version: 5,
                settlements: {},
                civilizations: {}
            }
        }
    }


    function cc2civSaveDatabase(
        server,
        db
    ) {

        db.version = 5

        server.persistentData.putString(
            CC2CIV_DATA_KEY,
            JSON.stringify(
                db
            )
        )
    }


    // ========================================================
    // MILLENAIRE / POSITION HELPERS
    // ========================================================

    function cc2civGetContext(player) {

        var level =
            player.serverLevel()

        var savedData =
            $CC2CivVillageSavedData.get(
                level
            )

        return {
            level: level,
            manager:
                savedData.getVillageManager()
        }
    }


    function cc2civDimensionId(level) {

        return String(
            level.dimension()
                .location()
        )
    }


    function cc2civVillageUUID(village) {

        return String(
            village.getId()
                .uuid()
                .toString()
        )
    }


    function cc2civFindCurrentDistrict(
        player,
        manager
    ) {

        return manager.findNearestVillage(
            player.blockPosition(),
            CC2CIV_DISTRICT_LOOKUP_RADIUS
        )
    }


    function cc2civResolveDistrict(
        manager,
        uuidString
    ) {

        try {

            return manager.getVillage(
                new $CC2CivVillageId(
                    $CC2CivUUID.fromString(
                        String(uuidString)
                    )
                )
            )
        }

        catch (e) {
            return null
        }
    }


    function cc2civPosObject(pos) {

        return {
            x: pos.getX(),
            y: pos.getY(),
            z: pos.getZ()
        }
    }


    function cc2civObjectPos(obj) {

        return new $CC2CivBlockPos(
            Number(obj.x),
            Number(obj.y),
            Number(obj.z)
        )
    }


    function cc2civDistanceXZ(
        a,
        b
    ) {

        var dx =
            a.getX() -
            b.getX()

        var dz =
            a.getZ() -
            b.getZ()

        return Math.sqrt(
            dx * dx +
            dz * dz
        )
    }


    function cc2civFindSettlementForDistrict(
        db,
        villageUuid
    ) {

        var ids =
            Object.keys(
                db.settlements
            )

        for (
            var i = 0;
            i < ids.length;
            i++
        ) {

            var settlement =
                cc2civEnsureSettlementShape(
                    db.settlements[
                        ids[i]
                    ]
                )

            if (
                settlement.districts[
                    villageUuid
                ] != null
            ) {
                return settlement
            }
        }

        return null
    }


    function cc2civFindCapitolCenter(village) {

        var buildings =
            village.getBuildings()

        if (buildings == null) {
            return null
        }


        for (
            var i = 0;
            i < buildings.size();
            i++
        ) {

            var building =
                buildings.get(i)


            try {

                var planSet =
                    $CC2CivModCultures
                        .getBuildingPlanSet(
                            building.getPlanSetId()
                        )

                if (
                    planSet != null &&
                    planSet.hasTag(
                        CC2CIV_CAPITOL_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            try {

                var plan =
                    $CC2CivModCultures
                        .getBuildingPlan(
                            building.getPlanId()
                        )

                if (
                    plan != null &&
                    plan.hasTag(
                        CC2CIV_CAPITOL_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            try {

                if (
                    building.hasRuntimeTag(
                        CC2CIV_CAPITOL_TAG
                    )
                ) {
                    return building
                }
            }

            catch (e) {
            }


            var planSetId =
                String(
                    building.getPlanSetId()
                )

            if (
                planSetId ===
                    'millenaire:civnormans/capitolcenter' ||
                planSetId ===
                    'millenaire:civnormans/capitol_center'
            ) {
                return building
            }
        }

        return null
    }


    // ========================================================
    // CIVILIZATION LOOKUPS
    // ========================================================

    function cc2civMakeId(
        district,
        capitol
    ) {

        var pos =
            capitol.getOrigin()

        return (
            'civilization_' +
            cc2civVillageUUID(
                district
            ).replace(
                /-/g,
                ''
            ) +
            '_' +
            pos.getX() +
            '_' +
            pos.getY() +
            '_' +
            pos.getZ()
        )
    }


    function cc2civSelect(
        player,
        civ
    ) {

        player.persistentData.putString(
            CC2CIV_PLAYER_SELECTED_KEY,
            civ.id
        )
    }


    function cc2civGetSelected(
        player,
        db
    ) {

        var id =
            player.persistentData.getString(
                CC2CIV_PLAYER_SELECTED_KEY
            )

        if (
            id == null ||
            String(id).trim() === ''
        ) {
            return null
        }

        var civ =
            db.civilizations[
                String(id)
            ]

        return civ == null
            ? null
            : cc2civEnsureCivilizationShape(
                civ
            )
    }


    function cc2civGetForSettlement(
        db,
        settlement
    ) {

        settlement =
            cc2civEnsureSettlementShape(
                settlement
            )

        if (
            settlement.civilizationId == null ||
            String(
                settlement.civilizationId
            ) === ''
        ) {
            return null
        }

        var civ =
            db.civilizations[
                settlement.civilizationId
            ]

        return civ == null
            ? null
            : cc2civEnsureCivilizationShape(
                civ
            )
    }


    function cc2civCreateOrGet(
        player,
        context,
        db,
        district,
        capitol,
        capitalSettlement
    ) {

        var id =
            cc2civMakeId(
                district,
                capitol
            )

        var existing =
            db.civilizations[
                id
            ]


        if (existing != null) {

            existing =
                cc2civEnsureCivilizationShape(
                    existing
                )

            cc2civSelect(
                player,
                existing
            )

            return {
                civilization: existing,
                created: false
            }
        }


        if (
            capitalSettlement.civilizationId != null &&
            String(
                capitalSettlement.civilizationId
            ) !== ''
        ) {

            return {
                error:
                    'This Palace settlement already belongs to another Civilization.'
            }
        }


        var civ = {

            id: id,

            name:
                String(
                    capitalSettlement.name
                ),

            dimension:
                cc2civDimensionId(
                    context.level
                ),

            administrativeRadius:
                CC2CIV_CAPITOL_SETTLEMENT_RADIUS,

            createdAt:
                Date.now(),

            createdBy: {
                uuid:
                    String(
                        player.uuid
                    ),

                name:
                    String(
                        player.name.string
                    )
            },

            capitol: {
                districtVillageUuid:
                    cc2civVillageUUID(
                        district
                    ),

                capitalSettlementId:
                    capitalSettlement.id,

                planId:
                    String(
                        capitol.getPlanId()
                    ),

                planSetId:
                    String(
                        capitol.getPlanSetId()
                    ),

                origin:
                    cc2civPosObject(
                        capitol.getOrigin()
                    )
            },

            settlements: {},
            signs: {},
            addonStats: {},
            addonAbilities: [],
            addonBreakdown: {},

            values: {
                treasury: 0,
                infrastructure: 0,
                research: 0,
                legitimacy: 0,
                policy: 'Default',
                project: 'None'
            }
        }


        civ.settlements[
            capitalSettlement.id
        ] = {
            settlementId:
                capitalSettlement.id,

            name:
                capitalSettlement.name,

            capital:
                true,

            palaceOrigin:
                capitalSettlement.palace.origin
        }


        capitalSettlement.civilizationId =
            id


        db.civilizations[
            id
        ] =
            civ


        cc2civSaveDatabase(
            player.server,
            db
        )


        cc2civSelect(
            player,
            civ
        )


        console.info(
            CC2CIV_LOG_PREFIX +
            'Created Civilization "' +
            civ.name +
            '" at Capitol Center ' +
            civ.capitol.planSetId +
            '.'
        )


        return {
            civilization: civ,
            created: true
        }
    }


    function cc2civSettlementDistance(
        civ,
        settlement
    ) {

        var capitolPos =
            cc2civObjectPos(
                civ.capitol.origin
            )

        var palacePos =
            cc2civObjectPos(
                settlement.palace.origin
            )

        return cc2civDistanceXZ(
            capitolPos,
            palacePos
        )
    }


    function cc2civLinkSettlement(
        server,
        db,
        civ,
        settlement
    ) {

        civ =
            cc2civEnsureCivilizationShape(
                civ
            )

        settlement =
            cc2civEnsureSettlementShape(
                settlement
            )


        if (
            settlement.dimension !==
            civ.dimension
        ) {

            return {
                error:
                    'Palace settlement and Capitol Center are in different dimensions.'
            }
        }


        if (
            settlement.civilizationId != null &&
            String(
                settlement.civilizationId
            ) !== ''
        ) {

            if (
                settlement.civilizationId ===
                civ.id
            ) {
                return {
                    alreadyLinked: true
                }
            }

            return {
                error:
                    'This Palace settlement already belongs to another Civilization.'
            }
        }


        var distance =
            cc2civSettlementDistance(
                civ,
                settlement
            )


        if (
            distance >
            civ.administrativeRadius
        ) {

            return {
                error:
                    'This Palace is ' +
                    Math.round(distance) +
                    ' blocks from the Capitol Center, beyond the ' +
                    civ.administrativeRadius +
                    '-block Civilization radius.'
            }
        }


        civ.settlements[
            settlement.id
        ] = {
            settlementId:
                settlement.id,

            name:
                settlement.name,

            capital:
                false,

            palaceOrigin:
                settlement.palace.origin
        }


        settlement.civilizationId =
            civ.id


        cc2civSaveDatabase(
            server,
            db
        )


        return {
            linked: true,
            distance: distance
        }
    }


    // ========================================================
    // CIVILIZATION STATS
    // ========================================================

    function cc2civNewStats() {

        return {
            settlement_count: 0,
            district_count: 0,
            village_districts: 0,
            lone_building_districts: 0,
            population: 0,
            building_count: 0,
            operational_buildings: 0,

            food_supply: 0,
            food_demand: 0,
            security_supply: 0,
            security_demand: 0,
            industry_supply: 0,
            logistics_capacity: 0,
            logistics_demand: 0,
            administration_supply: 0,

            treasury: 0,
            infrastructure: 0,
            research: 0,

            missing_settlements: 0,
            missing_districts: 0
        }
    }


    function cc2civAdd(
        stats,
        key,
        amount
    ) {

        amount =
            Number(amount)

        if (
            !isFinite(amount)
        ) {
            return
        }

        if (
            stats[key] == null
        ) {
            stats[key] = 0
        }

        stats[key] +=
            amount
    }


    function cc2civApplyBuildingRule(
        stats,
        building
    ) {

        if (
            !building.isOperational()
        ) {
            return
        }


        var id =
            String(
                building.getPlanSetId()
            )

        var rule =
            CC2CIV_BUILDING_STAT_RULES[
                id
            ]


        if (rule != null) {

            var keys =
                Object.keys(
                    rule
                )

            for (
                var i = 0;
                i < keys.length;
                i++
            ) {

                cc2civAdd(
                    stats,
                    keys[i],
                    rule[
                        keys[i]
                    ]
                )
            }
        }


        // Also honor generic cc2_stat_* tags.
        var seen = {}


        function applyTags(collection) {

            if (collection == null) {
                return
            }

            try {

                var iterator =
                    collection.iterator()

                while (
                    iterator.hasNext()
                ) {

                    var tag =
                        String(
                            iterator.next()
                        )

                    if (seen[tag]) {
                        continue
                    }

                    seen[tag] = true

                    var match =
                        /^cc2_stat_(.+)_(-?\d+)$/
                            .exec(
                                tag
                            )

                    if (match != null) {

                        cc2civAdd(
                            stats,
                            match[1],
                            parseInt(
                                match[2]
                            )
                        )
                    }
                }
            }

            catch (e) {
            }
        }


        try {

            var planSet =
                $CC2CivModCultures
                    .getBuildingPlanSet(
                        building.getPlanSetId()
                    )

            if (planSet != null) {
                applyTags(
                    planSet.tags()
                )
            }
        }

        catch (e) {
        }


        try {

            var plan =
                $CC2CivModCultures
                    .getBuildingPlan(
                        building.getPlanId()
                    )

            if (plan != null) {
                applyTags(
                    plan.tags()
                )
            }
        }

        catch (e) {
        }


        try {
            applyTags(
                building.getRuntimeTags()
            )
        }

        catch (e) {
        }
    }


    function cc2civComputeStats(
        context,
        db,
        civ
    ) {

        civ =
            cc2civEnsureCivilizationShape(
                civ
            )

        var stats =
            cc2civNewStats()

        var settlementIds =
            Object.keys(
                civ.settlements
            )

        stats.settlement_count =
            settlementIds.length


        for (
            var s = 0;
            s < settlementIds.length;
            s++
        ) {

            var settlement =
                db.settlements[
                    settlementIds[s]
                ]


            if (settlement == null) {

                stats.missing_settlements++
                continue
            }


            settlement =
                cc2civEnsureSettlementShape(
                    settlement
                )


            var districtIds =
                Object.keys(
                    settlement.districts
                )

            stats.district_count +=
                districtIds.length


            for (
                var d = 0;
                d < districtIds.length;
                d++
            ) {

                var village =
                    cc2civResolveDistrict(
                        context.manager,
                        districtIds[d]
                    )


                if (village == null) {

                    stats.missing_districts++
                    continue
                }


                if (
                    village.isLoneBuilding()
                ) {
                    stats.lone_building_districts++
                }

                else {
                    stats.village_districts++
                }


                stats.population +=
                    village.getVillagerUuids()
                        .size()


                var buildings =
                    village.getBuildings()

                stats.building_count +=
                    buildings.size()


                for (
                    var b = 0;
                    b < buildings.size();
                    b++
                ) {

                    var building =
                        buildings.get(b)

                    if (
                        building.isOperational()
                    ) {
                        stats.operational_buildings++
                    }

                    cc2civApplyBuildingRule(
                        stats,
                        building
                    )
                }
            }


            if (
                settlement.values != null
            ) {

                stats.treasury +=
                    Number(
                        settlement.values.treasury || 0
                    )
            }


            // Settlement extension bonuses also roll upward to the
            // Civilization level. This preserves the hierarchy:
            // Building/District -> Settlement -> Civilization.
            if (
                settlement.addonStats != null
            ) {

                var settlementAddonKeys =
                    Object.keys(
                        settlement.addonStats
                    )

                for (
                    var sa = 0;
                    sa < settlementAddonKeys.length;
                    sa++
                ) {

                    cc2civAdd(
                        stats,
                        settlementAddonKeys[sa],
                        settlement.addonStats[
                            settlementAddonKeys[sa]
                        ]
                    )
                }
            }


            // Temporary Palace abilities roll upward while active.
            if (
                settlement.abilityStats != null
            ) {

                var settlementAbilityKeys =
                    Object.keys(
                        settlement.abilityStats
                    )

                for (
                    var sab = 0;
                    sab < settlementAbilityKeys.length;
                    sab++
                ) {

                    cc2civAdd(
                        stats,
                        settlementAbilityKeys[sab],
                        settlement.abilityStats[
                            settlementAbilityKeys[sab]
                        ]
                    )
                }
            }
        }


        // Population-derived national demand is the sum of the same
        // simple rules used by each Palace settlement.
        stats.food_demand +=
            stats.population

        stats.security_demand +=
            Math.ceil(
                stats.population / 4
            )

        stats.logistics_demand +=
            Math.ceil(
                stats.population / 8
            )


        // Capitol-level persistent values stack above Palace totals.
        stats.treasury +=
            Number(
                civ.values.treasury || 0
            )

        stats.infrastructure +=
            Number(
                civ.values.infrastructure || 0
            )

        stats.research +=
            Number(
                civ.values.research || 0
            )


        // Civilization-level extension rules live above all Palaces.
        if (
            civ.addonStats != null
        ) {

            var civAddonKeys =
                Object.keys(
                    civ.addonStats
                )

            for (
                var ca = 0;
                ca < civAddonKeys.length;
                ca++
            ) {

                cc2civAdd(
                    stats,
                    civAddonKeys[ca],
                    civ.addonStats[
                        civAddonKeys[ca]
                    ]
                )
            }
        }


        return stats
    }


    function cc2civTellSummary(
        player,
        context,
        db,
        civ
    ) {

        var stats =
            cc2civComputeStats(
                context,
                db,
                civ
            )


        player.tell(
            '§6§lCivilization of ' +
            civ.name
        )

        player.tell(
            '§7Palace settlements: §f' +
            stats.settlement_count
        )

        player.tell(
            '§7Districts: §f' +
            stats.district_count +
            ' §8(' +
            stats.village_districts +
            ' villages, ' +
            stats.lone_building_districts +
            ' lone)'
        )

        player.tell(
            '§7Population: §f' +
            stats.population
        )

        player.tell(
            '§7Industry: §f' +
            stats.industry_supply
        )

        player.tell(
            '§7Security: §f' +
            stats.security_supply +
            ' / ' +
            stats.security_demand
        )

        player.tell(
            '§7Capitol radius: §f' +
            civ.administrativeRadius +
            ' blocks'
        )
    }


    // ========================================================
    // CIVILIZATION LEDGER
    // ========================================================

    ItemEvents.rightClicked(
        'kubejs:civilization_ledger',
        event => {

            var player =
                event.player

            try {

                var context =
                    cc2civGetContext(
                        player
                    )

                var db =
                    cc2civLoadDatabase(
                        player.server
                    )

                var district =
                    cc2civFindCurrentDistrict(
                        player,
                        context.manager
                    )


                if (district == null) {

                    player.tell(
                        '§cNo Millenaire district was found nearby.'
                    )

                    event.cancel()
                    return
                }


                var settlement =
                    cc2civFindSettlementForDistrict(
                        db,
                        cc2civVillageUUID(
                            district
                        )
                    )


                if (settlement == null) {

                    player.tell(
                        '§cThis district is not part of a Palace settlement.'
                    )

                    player.tell(
                        '§7The Capitol hierarchy requires District -> Palace -> Civilization.'
                    )

                    event.cancel()
                    return
                }


                // ------------------------------------------------
                // SHIFT: add THIS WHOLE Palace settlement to the
                // selected Civilization.
                // ------------------------------------------------

                if (
                    player.isCrouching()
                ) {

                    var selected =
                        cc2civGetSelected(
                            player,
                            db
                        )


                    if (selected == null) {

                        player.tell(
                            '§cNo Civilization selected.'
                        )

                        player.tell(
                            '§7Create/select one at its Capitol Center first.'
                        )

                        event.cancel()
                        return
                    }


                    var link =
                        cc2civLinkSettlement(
                            player.server,
                            db,
                            selected,
                            settlement
                        )


                    if (
                        link.error != null
                    ) {

                        player.tell(
                            '§c' +
                            link.error
                        )

                        event.cancel()
                        return
                    }


                    if (
                        link.alreadyLinked
                    ) {

                        player.tell(
                            '§eThis Palace settlement already belongs to §6' +
                            selected.name +
                            '§e.'
                        )
                    }

                    else {

                        player.tell(
                            '§aPalace settlement §6' +
                            settlement.name +
                            '§a joined Civilization §6' +
                            selected.name +
                            '§a.'
                        )

                        player.tell(
                            '§7Palace distance from Capitol: §f' +
                            Math.round(
                                link.distance
                            ) +
                            ' blocks'
                        )
                    }


                    cc2civTellSummary(
                        player,
                        context,
                        db,
                        selected
                    )

                    event.cancel()
                    return
                }


                // Existing member settlement selects its Civilization.
                var existingCiv =
                    cc2civGetForSettlement(
                        db,
                        settlement
                    )


                if (existingCiv != null) {

                    cc2civSelect(
                        player,
                        existingCiv
                    )

                    player.tell(
                        '§aSelected Civilization §6' +
                        existingCiv.name +
                        '§a.'
                    )

                    cc2civTellSummary(
                        player,
                        context,
                        db,
                        existingCiv
                    )

                    event.cancel()
                    return
                }


                // A new Civilization can ONLY be born at a Capitol Center.
                var capitol =
                    cc2civFindCapitolCenter(
                        district
                    )


                if (capitol == null) {

                    player.tell(
                        '§eThis Palace settlement is not part of a Civilization yet.'
                    )

                    player.tell(
                        '§7Build/unlock a Capitol Center at the Industrial Age,'
                    )

                    player.tell(
                        '§7or select an existing Civilization and Shift + right-click here.'
                    )

                    event.cancel()
                    return
                }


                var result =
                    cc2civCreateOrGet(
                        player,
                        context,
                        db,
                        district,
                        capitol,
                        settlement
                    )


                if (
                    result.error != null
                ) {

                    player.tell(
                        '§c' +
                        result.error
                    )

                    event.cancel()
                    return
                }


                if (
                    result.created
                ) {

                    player.tell(
                        '§6§lA Civilization has been established!'
                    )

                    player.tell(
                        '§7Capitol Center: §f' +
                        result.civilization.capitol.planSetId
                    )

                    player.tell(
                        '§7Capital Palace: §f' +
                        settlement.name
                    )
                }

                else {

                    player.tell(
                        '§aCivilization selected.'
                    )
                }


                cc2civTellSummary(
                    player,
                    context,
                    db,
                    result.civilization
                )

                event.cancel()
            }

            catch (e) {

                var errorText =
                    String(e)

                if (
                    errorText.indexOf(
                        'dev.latvian.mods.kubejs.event.EventExit'
                    ) >= 0
                ) {
                    return
                }

                player.tell(
                    '§c[Civilization Ledger] SCRIPT ERROR: §f' +
                    e
                )

                console.error(
                    CC2CIV_LOG_PREFIX +
                    e
                )
            }
        }
    )


    // ========================================================
    // CAPITOL CENTER SIGNS
    // ========================================================

    function cc2civIsSign(id) {

        id =
            String(id)

        return (
            id.indexOf('minecraft:') === 0 &&
            (
                id.endsWith('_sign') ||
                id.endsWith('_wall_sign') ||
                id.endsWith('_hanging_sign') ||
                id.endsWith('_wall_hanging_sign')
            )
        )
    }


    function cc2civCleanLine(value) {

        var text =
            String(
                value == null
                    ? ''
                    : value
            )

        return text.length > 20
            ? text.substring(0, 20)
            : text
    }


    function cc2civFindLocalCivilization(
        db,
        level,
        pos
    ) {

        var dimension =
            cc2civDimensionId(
                level
            )

        var ids =
            Object.keys(
                db.civilizations
            )

        var best = null
        var bestDistance =
            Number.MAX_VALUE


        for (
            var i = 0;
            i < ids.length;
            i++
        ) {

            var civ =
                cc2civEnsureCivilizationShape(
                    db.civilizations[
                        ids[i]
                    ]
                )

            if (
                civ.dimension !==
                dimension
            ) {
                continue
            }


            var capitolPos =
                cc2civObjectPos(
                    civ.capitol.origin
                )

            var distance =
                cc2civDistanceXZ(
                    capitolPos,
                    pos
                )


            if (
                distance <=
                    CC2CIV_SIGN_BIND_RADIUS &&
                distance <
                    bestDistance
            ) {

                best = civ
                bestDistance = distance
            }
        }


        return best
    }


    function cc2civBoundChannelAt(
        civ,
        dimension,
        pos
    ) {

        var channels =
            Object.keys(
                civ.signs
            )


        for (
            var i = 0;
            i < channels.length;
            i++
        ) {

            var binding =
                civ.signs[
                    channels[i]
                ]

            if (
                binding.dimension ===
                    dimension &&
                Number(binding.x) ===
                    pos.getX() &&
                Number(binding.y) ===
                    pos.getY() &&
                Number(binding.z) ===
                    pos.getZ()
            ) {
                return channels[i]
            }
        }

        return null
    }


    function cc2civFirstFreeChannel(civ) {

        for (
            var i = 0;
            i < CC2CIV_SIGN_CHANNELS.length;
            i++
        ) {

            if (
                civ.signs[
                    CC2CIV_SIGN_CHANNELS[i]
                ] == null
            ) {
                return CC2CIV_SIGN_CHANNELS[i]
            }
        }

        return 'overview'
    }


    function cc2civNextChannel(current) {

        var index =
            CC2CIV_SIGN_CHANNELS.indexOf(
                String(current)
            )

        return CC2CIV_SIGN_CHANNELS[
            (
                index < 0
                    ? 0
                    : index + 1
            ) %
            CC2CIV_SIGN_CHANNELS.length
        ]
    }


    function cc2civSignLines(
        channel,
        civ,
        stats
    ) {

        function net(
            supply,
            demand
        ) {

            var value =
                Number(supply || 0) -
                Number(demand || 0)

            return value > 0
                ? '+' + value
                : String(value)
        }


        switch (
            String(channel)
        ) {

            case 'overview':
                return [
                    civ.name,
                    'Settlements ' +
                        stats.settlement_count,
                    'Pop ' +
                        stats.population,
                    'Radius ' +
                        civ.administrativeRadius
                ]

            case 'settlements':
                return [
                    'PALACES',
                    'Settlements ' +
                        stats.settlement_count,
                    'Capital + ' +
                        Math.max(
                            0,
                            stats.settlement_count - 1
                        ),
                    'Districts ' +
                        stats.district_count
                ]

            case 'population':
                return [
                    'CIV POPULATION',
                    'People ' +
                        stats.population,
                    'Buildings ' +
                        stats.operational_buildings,
                    'Districts ' +
                        stats.district_count
                ]

            case 'districts':
                return [
                    'DISTRICTS',
                    'Villages ' +
                        stats.village_districts,
                    'Lone ' +
                        stats.lone_building_districts,
                    'Total ' +
                        stats.district_count
                ]

            case 'food':
                return [
                    'CIV FOOD',
                    'Supply ' +
                        stats.food_supply,
                    'Demand ' +
                        stats.food_demand,
                    'Net ' +
                        net(
                            stats.food_supply,
                            stats.food_demand
                        )
                ]

            case 'security':
                return [
                    'CIV SECURITY',
                    'Supply ' +
                        stats.security_supply,
                    'Demand ' +
                        stats.security_demand,
                    'Net ' +
                        net(
                            stats.security_supply,
                            stats.security_demand
                        )
                ]

            case 'industry':
                return [
                    'INDUSTRY',
                    'Output ' +
                        stats.industry_supply,
                    'Admin ' +
                        stats.administration_supply,
                    'Buildings ' +
                        stats.operational_buildings
                ]

            case 'logistics':
                return [
                    'LOGISTICS',
                    'Capacity ' +
                        stats.logistics_capacity,
                    'Demand ' +
                        stats.logistics_demand,
                    'Net ' +
                        net(
                            stats.logistics_capacity,
                            stats.logistics_demand
                        )
                ]

            case 'treasury':
                return [
                    'CIV TREASURY',
                    String(
                        stats.treasury
                    ),
                    'deniers',
                    ''
                ]

            case 'infrastructure':
                return [
                    'INFRASTRUCTURE',
                    'Score ' +
                        stats.infrastructure,
                    '',
                    ''
                ]

            case 'research':
                return [
                    'RESEARCH',
                    'Score ' +
                        stats.research,
                    '',
                    ''
                ]

            case 'policy':
                return [
                    'CIV POLICY',
                    civ.values.policy,
                    '',
                    ''
                ]

            case 'project':
                return [
                    'NATIONAL PROJECT',
                    civ.values.project,
                    '',
                    ''
                ]
        }


        return [
            'CIVCRAFT',
            civ.name,
            '',
            ''
        ]
    }


    function cc2civWriteSign(
        level,
        pos,
        lines
    ) {

        try {

            if (
                !level.isLoaded(
                    pos
                )
            ) {
                return false
            }


            var blockEntity =
                level.getBlockEntity(
                    pos
                )

            if (
                !(
                    blockEntity instanceof
                    $CC2CivSignBlockEntity
                )
            ) {
                return false
            }


            var text =
                new $CC2CivSignText()


            for (
                var i = 0;
                i < 4;
                i++
            ) {

                text =
                    text.setMessage(
                        i,
                        $CC2CivComponent.literal(
                            cc2civCleanLine(
                                lines[i]
                            )
                        )
                    )
            }


            blockEntity.setText(
                text,
                true
            )

            blockEntity.setText(
                text,
                false
            )

            blockEntity.setChanged()


            var state =
                level.getBlockState(
                    pos
                )

            level.sendBlockUpdated(
                pos,
                state,
                state,
                3
            )

            return true
        }

        catch (e) {

            console.error(
                CC2CIV_LOG_PREFIX +
                'Sign update failed: ' +
                e
            )

            return false
        }
    }


    BlockEvents.rightClicked(
        event => {

            if (
                String(
                    event.item.id
                ) !==
                'kubejs:civilization_ledger'
            ) {
                return
            }


            if (
                !cc2civIsSign(
                    event.block.id
                )
            ) {
                return
            }


            var player =
                event.player

            try {

                var context =
                    cc2civGetContext(
                        player
                    )

                var db =
                    cc2civLoadDatabase(
                        player.server
                    )

                var pos =
                    new $CC2CivBlockPos(
                        event.block.x,
                        event.block.y,
                        event.block.z
                    )

                var civ =
                    cc2civFindLocalCivilization(
                        db,
                        context.level,
                        pos
                    )


                if (civ == null) {

                    player.tell(
                        '§cNo local Capitol Center Civilization owns this sign.'
                    )

                    event.cancel()
                    return
                }


                cc2civSelect(
                    player,
                    civ
                )


                var oldChannel =
                    cc2civBoundChannelAt(
                        civ,
                        civ.dimension,
                        pos
                    )


                var channel

                if (
                    oldChannel != null &&
                    player.isCrouching()
                ) {
                    channel =
                        cc2civNextChannel(
                            oldChannel
                        )
                }

                else if (
                    oldChannel != null
                ) {
                    channel =
                        oldChannel
                }

                else {
                    channel =
                        cc2civFirstFreeChannel(
                            civ
                        )
                }


                if (
                    oldChannel != null
                ) {

                    delete civ.signs[
                        oldChannel
                    ]
                }


                civ.signs[
                    channel
                ] = {
                    dimension:
                        civ.dimension,

                    x: pos.getX(),
                    y: pos.getY(),
                    z: pos.getZ()
                }


                cc2civSaveDatabase(
                    player.server,
                    db
                )


                var stats =
                    cc2civComputeStats(
                        context,
                        db,
                        civ
                    )


                cc2civWriteSign(
                    context.level,
                    pos,
                    cc2civSignLines(
                        channel,
                        civ,
                        stats
                    )
                )


                player.tell(
                    '§aCapitol sign bound: §6' +
                    channel.toUpperCase()
                )

                event.cancel()
            }

            catch (e) {

                var errorText =
                    String(e)

                if (
                    errorText.indexOf(
                        'dev.latvian.mods.kubejs.event.EventExit'
                    ) >= 0
                ) {
                    return
                }

                player.tell(
                    '§c[Capitol Sign] SCRIPT ERROR: §f' +
                    e
                )

                console.error(
                    CC2CIV_LOG_PREFIX +
                    e
                )
            }
        }
    )


    // ========================================================
    // PERIODIC CAPITOL SIGN REFRESH
    // ========================================================

    function cc2civResolveLevel(
        server,
        dimensionId
    ) {

        try {

            var iterator =
                server.getAllLevels()
                    .iterator()

            while (
                iterator.hasNext()
            ) {

                var level =
                    iterator.next()

                if (
                    cc2civDimensionId(
                        level
                    ) ===
                    String(
                        dimensionId
                    )
                ) {
                    return level
                }
            }
        }

        catch (e) {
        }

        return null
    }


    ServerEvents.tick(
        event => {

            CC2CIV_TICK_COUNTER++

            if (
                CC2CIV_TICK_COUNTER <
                CC2CIV_SIGN_REFRESH_TICKS
            ) {
                return
            }

            CC2CIV_TICK_COUNTER = 0


            try {

                var db =
                    cc2civLoadDatabase(
                        event.server
                    )

                var ids =
                    Object.keys(
                        db.civilizations
                    )


                for (
                    var i = 0;
                    i < ids.length;
                    i++
                ) {

                    var civ =
                        cc2civEnsureCivilizationShape(
                            db.civilizations[
                                ids[i]
                            ]
                        )


                    if (
                        Object.keys(
                            civ.signs
                        ).length === 0
                    ) {
                        continue
                    }


                    var level =
                        cc2civResolveLevel(
                            event.server,
                            civ.dimension
                        )

                    if (level == null) {
                        continue
                    }


                    var context = {
                        level: level,
                        manager:
                            $CC2CivVillageSavedData
                                .get(level)
                                .getVillageManager()
                    }


                    var stats =
                        cc2civComputeStats(
                            context,
                            db,
                            civ
                        )


                    var channels =
                        Object.keys(
                            civ.signs
                        )


                    for (
                        var c = 0;
                        c < channels.length;
                        c++
                    ) {

                        var channel =
                            channels[c]

                        var binding =
                            civ.signs[
                                channel
                            ]

                        cc2civWriteSign(
                            level,
                            new $CC2CivBlockPos(
                                Number(
                                    binding.x
                                ),
                                Number(
                                    binding.y
                                ),
                                Number(
                                    binding.z
                                )
                            ),
                            cc2civSignLines(
                                channel,
                                civ,
                                stats
                            )
                        )
                    }
                }
            }

            catch (e) {

                console.error(
                    CC2CIV_LOG_PREFIX +
                    'Periodic Capitol sign refresh failed: ' +
                    e
                )
            }
        }
    )


    console.info(
        CC2CIV_LOG_PREFIX +
        'v0.6 ABILITY-ROLLUP loaded. Capitol -> Palace Settlement -> District hierarchy active. ' +
        'Civilization radius=' +
        CC2CIV_CAPITOL_SETTLEMENT_RADIUS +
        '.'
    )

})()
