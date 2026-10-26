// FindMe does not see TFC placed items through Container or the item-handler capability.
// Inspect only this TFC storage type, read-only; do not expose it to remote extraction.
const $CCFindMeMod = Java.loadClass('com.buuz135.findme.FindMeMod')
const $CCPlacedItemBlockEntity = Java.loadClass('net.dries007.tfc.common.blockentities.PlacedItemBlockEntity')
const $CCFindMeItemStack = Java.loadClass('net.minecraft.world.item.ItemStack')
const $CCFindMeBiPredicate = Java.loadClass('java.util.function.BiPredicate')

const ccFindMePlacedItems = new $CCFindMeBiPredicate({
    test(blockEntity, searchedStack) {
        if (!(blockEntity instanceof $CCPlacedItemBlockEntity) || searchedStack.isEmpty()) {
            return false
        }
        const inventory = blockEntity.getInventory()
        for (let slot = 0; slot < inventory.getSlots(); slot++) {
            // JEI supplies a pristine stack; placed tools may have damage or other components.
            const storedStack = inventory.getStackInSlot(slot)
            if (!storedStack.isEmpty() && $CCFindMeItemStack.isSameItem(searchedStack, storedStack)) {
                return true
            }
        }
        return false
    }
})

ServerEvents.loaded(() => {
    $CCFindMeMod.BLOCK_CHECKERS.add(ccFindMePlacedItems)
    console.info('FindMe: registered read-only TFC placed-item search')
})
ServerEvents.unloaded(() => {
    $CCFindMeMod.BLOCK_CHECKERS.remove(ccFindMePlacedItems)
})
