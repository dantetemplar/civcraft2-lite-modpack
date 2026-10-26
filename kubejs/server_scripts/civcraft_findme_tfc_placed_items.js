// Read-only FindMe integration for nested inventories and TFC storage.
// Keep the filename stable so existing clients/servers replace the previous checker.
const $CCFindMeMod = Java.loadClass('com.buuz135.findme.FindMeMod')
const $CCFindMeCompare = Java.loadClass('com.buuz135.findme.network.PositionRequestMessage')
const $CCFindMeContainer = Java.loadClass('net.minecraft.world.Container')
const $CCFindMeTFCInventory = Java.loadClass('net.dries007.tfc.common.blockentities.InventoryBlockEntity')
const $CCFindMeBiPredicate = Java.loadClass('java.util.function.BiPredicate')
const $CCFindMeTFCComponents = Java.loadClass('net.dries007.tfc.common.component.TFCComponents')
const $CCFindMeDataComponents = Java.loadClass('net.minecraft.core.component.DataComponents')
const $CCFindMeCapabilities = Java.loadClass('net.neoforged.neoforge.capabilities.Capabilities')
const $CCFindMeDirection = Java.loadClass('net.minecraft.core.Direction')
const $CCFindMeIdentityMap = Java.loadClass('java.util.IdentityHashMap')
const ccFindMeMaxDepth = 8
const ccFindMeMaxStacks = 2048

function ccFindMeScanContents(contents, searchedStack, depth, scan) {
    const iterator = contents.iterator()
    while (scan.remaining > 0 && iterator.hasNext()) {
        if (ccFindMeStackMatches(iterator.next(), searchedStack, depth, scan)) {
            return true
        }
    }
    return false
}

function ccFindMeScanHandler(handler, searchedStack, depth, scan) {
    if (handler == null) {
        return false
    }
    const seenDepth = scan.handlers.get(handler)
    if (seenDepth != null && Number(seenDepth) <= depth) {
        return false
    }
    scan.handlers.put(handler, depth)
    for (let slot = 0; slot < handler.getSlots() && scan.remaining > 0; slot++) {
        if (ccFindMeStackMatches(handler.getStackInSlot(slot), searchedStack, depth, scan)) {
            return true
        }
    }
    return false
}

function ccFindMeStackMatches(storedStack, searchedStack, depth, scan) {
    if (scan.remaining <= 0) {
        return false
    }
    scan.remaining--
    if (storedStack.isEmpty()) {
        return false
    }
    const seenDepth = scan.stacks.get(storedStack)
    if (seenDepth != null && Number(seenDepth) <= depth) {
        return false
    }
    scan.stacks.put(storedStack, depth)
    // Follow FindMe's IGNORE_ITEM_DAMAGE setting, including component comparison.
    if ($CCFindMeCompare.compareItems(searchedStack, storedStack)) {
        return true
    }
    if (depth >= ccFindMeMaxDepth) {
        return false
    }
    // Prefer stored components: no capability initialization, heat/food updates or extraction.
    const container = storedStack.get($CCFindMeDataComponents.CONTAINER)
    if (container != null && ccFindMeScanContents(container.nonEmptyItems(), searchedStack, depth + 1, scan)) {
        return true
    }
    const bundle = storedStack.get($CCFindMeDataComponents.BUNDLE_CONTENTS)
    if (bundle != null && ccFindMeScanContents(bundle.items(), searchedStack, depth + 1, scan)) {
        return true
    }
    const vessel = storedStack.get($CCFindMeTFCComponents.VESSEL.get())
    if (vessel != null && ccFindMeScanContents(vessel.itemContent(), searchedStack, depth + 1, scan)) {
        return true
    }
    const tfcContents = storedStack.get($CCFindMeTFCComponents.CONTENTS.get())
    if (tfcContents != null && ccFindMeScanContents(tfcContents.contents(), searchedStack, depth + 1, scan)) {
        return true
    }
    const barrel = storedStack.get($CCFindMeTFCComponents.BARREL.get())
    if (barrel != null && ccFindMeScanContents(barrel.itemContent(), searchedStack, depth + 1, scan)) {
        return true
    }
    if (container != null || bundle != null || vessel != null || tfcContents != null || barrel != null || scan.remaining <= 0) {
        return false
    }
    // Other mods expose inventories through NeoForge. Query a copy so a provider
    // initializing its capability cannot write components onto the stored stack.
    const handler = storedStack.copy().getCapability($CCFindMeCapabilities.ItemHandler.ITEM)
    return ccFindMeScanHandler(handler, searchedStack, depth + 1, scan)
}

const ccFindMePlacedItems = new $CCFindMeBiPredicate({
    test(blockEntity, searchedStack) {
        if (searchedStack.isEmpty()) {
            return false
        }
        const scan = {
            remaining: ccFindMeMaxStacks,
            stacks: new $CCFindMeIdentityMap(),
            handlers: new $CCFindMeIdentityMap()
        }
        if (blockEntity instanceof $CCFindMeContainer) {
            for (let slot = 0; slot < blockEntity.getContainerSize() && scan.remaining > 0; slot++) {
                if (ccFindMeStackMatches(blockEntity.getItem(slot), searchedStack, 0, scan)) {
                    return true
                }
            }
            return false
        }
        if (blockEntity instanceof $CCFindMeTFCInventory) {
            return ccFindMeScanHandler(blockEntity.getInventory(), searchedStack, 0, scan)
        }
        const level = blockEntity.getLevel()
        if (level == null || scan.remaining <= 0) {
            return false
        }
        const pos = blockEntity.getBlockPos()
        const capability = $CCFindMeCapabilities.ItemHandler.BLOCK
        if (ccFindMeScanHandler(level.getCapability(capability, pos, null), searchedStack, 0, scan)) {
            return true
        }
        // Sided-only mod inventories are valid search targets too.
        const sides = $CCFindMeDirection.values()
        for (let side = 0; side < sides.length && scan.remaining > 0; side++) {
            if (ccFindMeScanHandler(level.getCapability(capability, pos, sides[side]), searchedStack, 0, scan)) {
                return true
            }
        }
        return false
    }
})

ServerEvents.loaded(() => {
    $CCFindMeMod.BLOCK_CHECKERS.add(ccFindMePlacedItems)
    console.info('FindMe: registered read-only nested inventory search (depth 8, 2048 stacks/block)')
})
ServerEvents.unloaded(() => {
    $CCFindMeMod.BLOCK_CHECKERS.remove(ccFindMePlacedItems)
})
