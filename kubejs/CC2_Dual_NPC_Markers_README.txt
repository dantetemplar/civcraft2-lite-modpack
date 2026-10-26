CIVCRAFT 2 - MILLENAIRE -> MCA + EASY NPC CARPET MARKERS
=========================================================

INSTALL
-------

1. Put:

   civcraft_millenaire_mca_easynpc_markers.js

   in:

   kubejs/server_scripts/

2. REMOVE / disable the older experimental CustomNPCs carpet bridge scripts.
   Do not run several carpet scanners on the same Millenaire templates.

3. MCA:
   The script supports MCA directly. Your CivCraft 2 pack already contains MCA.

4. Easy NPC:
   Install a 1.21.1 NeoForge Easy NPC build before using roles configured with:

       backend: 'easy_npc'

   The Easy NPC class is lazy-loaded. If Easy NPC is absent, MCA markers can
   still work and Easy NPC markers stay intact instead of killing the script.

5. /reload reloads KubeJS server scripts, but adding/removing a mod itself
   requires a normal game restart.


WHAT THE COLORS MEAN
--------------------

white       ambient
orange      tavern_patron
magenta     traveler
light blue  resident
yellow      merchant
lime        worker
pink        social
gray        guard
light gray  sentry
cyan        specialist
purple      entertainer
blue        official
brown       laborer
green       farmer
red         soldier
black       special

Use WOOL when you want actual colored flooring.


DEFAULT BEHAVIOR
----------------

These roles default to MCA:
    ambient
    tavern_patron
    traveler
    resident
    worker
    social
    laborer
    farmer

These roles intentionally do NOTHING until you configure a backend:
    merchant
    guard
    sentry
    specialist
    entertainer
    official
    soldier
    special

A marker with no backend is left in the world.


MCA EXAMPLES
------------

Any rule can say:

    resident: {
        backend: 'mca',
        gender: 'random'
    }

Force gender:

    resident: {
        backend: 'mca',
        gender: 'female'
    }

Optional exact/random names:

    official: {
        backend: 'mca',
        names: [
            'Alice',
            'Beatrice',
            'Cecilia'
        ]
    }

Optional age:

    resident: {
        backend: 'mca',
        age: 0
    }

If age is omitted, MCA's own VillagerFactory chooses its normal age.


EASY NPC EXAMPLES
-----------------

Easy NPC uses DATA presets.

Single preset:

    guard: {
        backend: 'easy_npc',
        preset: 'billenaire:norman_guard'
    }

Random preset pool:

    tavern_patron: {
        backend: 'easy_npc',
        presets: [
            'billenaire:norman_patron_1',
            'billenaire:norman_patron_2',
            'billenaire:norman_patron_3'
        ]
    }

The string is a ResourceLocation identifying the Easy NPC DATA preset.


CONFIG PRIORITY
---------------

1. Role default
2. Culture rule
3. Village-type rule
4. Building rule
5. Exact culture + village + building rule
6. Exact generated village UUID rule

Later rules override earlier ones.


EXAMPLE: ALL NORMAN GUARDS USE EASY NPC
---------------------------------------

In CC2DUAL_CULTURE_RULES:

    'millenaire:civnormans': {
        guard: {
            backend: 'easy_npc',
            preset: 'billenaire:norman_guard'
        }
    }


EXAMPLE: ONLY THE SURVIVAL-VILLAGE WELL
---------------------------------------

In CC2DUAL_EXACT_RULES:

    'millenaire:civnormans||millenaire:civnormans/survivalvillage||millenaire:civnormans/well': {
        guard: {
            backend: 'easy_npc',
            preset: 'billenaire:norman_guard'
        }
    }


SAFETY / FAILURE BEHAVIOR
-------------------------

The script checks an exact carpet position from Millenaire's compiled building
template.

Then:

    resolve role
       ->
    resolve backend
       ->
    try spawn
       ->
    spawn reports success
       ->
    remove carpet
       ->
    persist slot as completed

If spawning throws, a mod is missing, or an Easy NPC preset cannot be imported:

    THE CARPET IS LEFT IN PLACE.

That lets you fix the configuration and retry.


IMPORTANT V1 LIMITATION
-----------------------

This version intentionally does NOT respawn dead NPCs.

That is deliberate. First prove both MCA and Easy NPC spawn backends reliably
inside your real CivCraft 2 instance. Once they are proven, respawn / guard
replacement can be added without mixing that problem into initial spawning.


LOG LINES
---------

Successful spawn:

    [CC2 Dual NPC Markers] SPAWN OK: backend=mca ...

or:

    [CC2 Dual NPC Markers] SPAWN OK: backend=easy_npc ...

Failure:

    [CC2 Dual NPC Markers] SPAWN FAILED: ... Carpet left in place.

Building scan:

    [CC2 Dual NPC Markers] SCAN: culture=..., village=..., building=...


RESETTING DURING DEVELOPMENT
----------------------------

Persistent keys use version:

    dual1

If you intentionally need every marker slot to be treated as new in a TEST
world after changing behavior, change:

    var CC2DUAL_STATE_VERSION = 'dual1'

to a fresh value such as:

    'dual2'

Do NOT casually bump this in a released pack, because it intentionally makes
previously handled template slots look new again and can duplicate NPCs.


WHY THIS IS SEPARATED FROM CUSTOMNPCS
-------------------------------------

There is no CustomNPCs code in this file.

MCA and Easy NPC have independent backend functions. Millenaire marker
detection does not care which one is selected.
