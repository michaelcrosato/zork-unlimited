## 2025-05-18 - Early Presence Guard in Legal Action Enumeration
**Learning:** In state space exploration and action enumeration (`enumerateRpgBaseActions`), iterating over global interaction lists (`objectsWithUseInteractions`) constructs action projection objects and formats command strings even for interactions whose target or required item is absent from the current room/inventory.
**Action:** Always apply fast presence guards (`present(index, state, target)` and inventory checks) early in enumeration loops before constructing projections or evaluating conditions.
