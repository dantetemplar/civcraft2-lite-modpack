// ============================================================
// CivCraft 2 — Settlement System v0.5 MULTI-PALACE
// CLIENT SCRIPT
// Put in: kubejs/client_scripts/
// ============================================================

ItemEvents.modifyTooltips(event => {
    event.add('kubejs:settlement_ledger', [
        Text.of('§6Administrative record of a CivCraft settlement.'),
        Text.of(''),
        Text.of('§eRight-click§7 in a Palace district to create/select its settlement.'),
        Text.of('§eShift + Right-click§7 in another Millénaire village or lone building'),
        Text.of('§7to attach it as a district, if it lies inside the Palace radius.'),
        Text.of(''),
        Text.of('§eRight-click a Palace sign§7 to bind it to the LOCAL Palace automatically.'),
        Text.of('§eShift + Right-click a bound sign§7 to cycle its stat page.')
    ])
})


ItemEvents.modifyTooltips(event => {
    event.add('kubejs:settlement_requisition', [
        Text.of('§6Physical requisition from the selected settlement.'),
        Text.of(''),
        Text.of('§7Hold the item you want to audit in your §eoff hand§7.'),
        Text.of('§eRight-click EMPTY AIR§7 to audit safely available settlement stock.'),
        Text.of('§eShift + Right-click EMPTY AIR§7 to withdraw the off-hand stack amount.'),
        Text.of(''),
        Text.of('§8Millénaire construction, shop and resident reserves are protected.')
    ])
})
