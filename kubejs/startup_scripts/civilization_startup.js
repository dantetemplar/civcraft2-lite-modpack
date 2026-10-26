// ============================================================
// CivCraft 2 — Civilization / Capitol Center v0.5
// STARTUP SCRIPT
// Put in: kubejs/startup_scripts/
//
// No recipe is supplied intentionally.
// Grant/unlock this at the START OF THE INDUSTRIAL AGE.
// ============================================================

StartupEvents.registry('item', event => {

    event.create('civilization_ledger')
        .displayName('Civilization Ledger')
        .unstackable()
        .texture('minecraft:item:written_book')
        .glow(true)
})
