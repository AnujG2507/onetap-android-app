

# Fix: Missing Java Imports in ShortcutPlugin.java

## Problem

The `cleanupRegistry` method added in the previous change uses `Set`, `Map`, and `Map.Entry` but only `HashSet` was imported. `Set` and `Map` are missing from the import block, causing 3 compilation errors.

## Fix

**File**: `native/android/app/src/main/java/app/onetap/access/plugins/ShortcutPlugin.java`

Add two imports at line 75 (after the existing `java.util.List` import):

```java
import java.util.Map;
import java.util.Set;
```

The existing imports block (lines 72-75) currently has:
```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
```

After the fix:
```java
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
```

No other changes needed. This is a one-line (two-import) fix.

