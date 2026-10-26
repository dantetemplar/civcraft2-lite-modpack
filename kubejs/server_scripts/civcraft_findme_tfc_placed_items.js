// FindMe does not see TFC placed items through Container or the item-handler capability.
// Inspect only this TFC storage type, read-only; do not expose it to remote extraction.
const $CCFindMeMod = Java.loadClass('com.buuz135.findme.FindMeMod')
const $CCPlacedItemBlockEntity = Java.loadClass('net.dries007.tfc.common.blockentities.PlacedItemBlockEntity')
const $CCFindMeItemStack = Java.loadClass('net.minecraft.world.item.ItemStack')
const $CCFindMeBiPredicate = Java.loadClass('java.util.function.BiPredicate')
const $CCFindMeTFCComponents = Java.loadClass('net.dries007.tfc.common.component.TFCComponents')

function ccFindMePlacedStackMatches(storedStack, searchedStack) {
    if (storedStack.isEmpty()) {
        return false
    }
    if ($CCFindMeItemStack.isSameItem(searchedStack, storedStack)) {
        return true
    }
    // Read the immutable component directly: Vessel.get() creates a mutable heat view.
    // Inspect one level only; do not extract, update food/heat, or recurse into containers.
    const vessel = storedStack.get($CCFindMeTFCComponents.VESSEL.get())
    if (vessel != null) {
        const contents = vessel.itemContent()
        for (let slot = 0; slot < contents.size(); slot++) {
            let containedStack = contents.get(slot)
            if (!containedStack.isEmpty() && $CCFindMeItemStack.isSameItem(searchedStack, containedStack)) {
                return true
            }
        }
    }
    return false
}

const ccFindMePlacedItems = new $CCFindMeBiPredicate({
    test(blockEntity, searchedStack) {
        if (!(blockEntity instanceof $CCPlacedItemBlockEntity) || searchedStack.isEmpty()) {
            return false
        }
        const inventory = blockEntity.getInventory()
        for (let slot = 0; slot < inventory.getSlots(); slot++) {
            // JEI supplies a pristine stack; placed tools may have damage or other components.
            let storedStack = inventory.getStackInSlot(slot)
            if (ccFindMePlacedStackMatches(storedStack, searchedStack)) {
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
