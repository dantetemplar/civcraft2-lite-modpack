// ============================================================
// CivCraft 2 — Settlement System v0.5 MULTI-PALACE
// STARTUP SCRIPT
// Put in: kubejs/startup_scripts/
// ============================================================

StartupEvents.registry('item', event => {
    event.create('settlement_ledger')
        .displayName('Settlement Ledger')
        .unstackable()
        .texture('minecraft:item/writable_book')
        .glow(true)

    event.create('settlement_requisition')
        .displayName('Settlement Requisition')
        .unstackable()
        .texture('minecraft:item/paper')
        .glow(true)
})
