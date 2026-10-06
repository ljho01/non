# Non for iOS

The iOS target keeps the existing React/Tiptap workspace inside `WKWebView` and
implements the bounded vault API in Swift. Mobile presents a single workspace
pane at a time: the native navigation bar switches between the library, document,
and assistant while the desktop document tab strip stays hidden. On iOS 26 and
later, the navigation toolbar adopts the system Liquid Glass appearance without
stacking an additional explicit glass style on each toolbar button.

```sh
cd ios
xcodegen generate
xcodebuild -project Non.xcodeproj -scheme Non \
  -destination 'platform=iOS Simulator,name=iPhone 14 Pro' build
```

The app requests the `iCloud.com.jaeho.Non` document container and stores files
under `Documents/non`. If iCloud is unavailable (including unsigned simulator
builds), it falls back to the app's local Documents/non directory. The WebView
never receives an absolute filesystem capability beyond the bounded bridge.

This private iCloud container syncs the iOS app's vault after the target is
signed with an iCloud-capable provisioning profile. It is not the same location
as the desktop app's `~/Documents/non` folder; sharing that exact existing Mac
vault requires either a one-time Files folder authorization on iOS or moving
both clients to a shared app container.
