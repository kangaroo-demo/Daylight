import AppKit
import ApplicationServices

// Native smoke checks target only Daylight. Requires existing macOS Accessibility permission.
guard AXIsProcessTrusted() else { fatalError("Accessibility permission is required for native smoke checks") }
guard let app = NSWorkspace.shared.runningApplications.first(where: { $0.bundleIdentifier == "app.daylight.calendar" }) else { fatalError("Launch Daylight first") }
let application = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetAttributeValue(application, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
let captureDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    .appendingPathComponent("tmp/native-smoke", isDirectory: true)
try FileManager.default.createDirectory(at: captureDirectory, withIntermediateDirectories: true)

func attr(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &result)
    return result
}
func all(_ element: AXUIElement, depth: Int = 0) -> [AXUIElement] {
    if depth > 22 { return [] }
    return [element] + (attr(element, kAXChildrenAttribute) as? [AXUIElement] ?? []).flatMap { all($0, depth: depth + 1) }
}
func windows() -> [AXUIElement] { attr(application, kAXWindowsAttribute) as? [AXUIElement] ?? [] }
func visibleWindows() -> [[String:Any]] {
    (CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []).filter { $0[kCGWindowOwnerPID as String] as? Int32 == app.processIdentifier }
}
func popupVisible() -> Bool { visibleWindows().contains { ($0[kCGWindowName as String] as? String ?? "") == "朝夕月历" } }
func name(_ element: AXUIElement) -> String { [attr(element, kAXTitleAttribute) as? String ?? "", attr(element, kAXDescriptionAttribute) as? String ?? ""].filter { !$0.isEmpty }.joined(separator: " ") }
func elements() -> [AXUIElement] {
    let title = popupVisible() ? "朝夕月历" : "朝夕 · Daylight"
    return windows().filter { (attr($0, kAXTitleAttribute) as? String) == title }.flatMap { all($0) }
}
func check(_ condition: @autoclosure () -> Bool, _ description: String) {
    guard condition() else { print("FAIL: " + description); exit(1) }
    print("PASS: " + description)
}
func waitFor(_ condition: () -> Bool) {
    for _ in 0..<30 { if condition() { return }; Thread.sleep(forTimeInterval: 0.1) }
}
func press(_ prefix: String) {
    let roles = ["AXButton", "AXPopUpButton", "AXCheckBox", "AXRadioButton"]
    waitFor { elements().contains { roles.contains(attr($0, kAXRoleAttribute) as? String ?? "") && name($0).contains(prefix) } }
    guard let element = elements().first(where: { roles.contains(attr($0, kAXRoleAttribute) as? String ?? "") && name($0).contains(prefix) }) else { print("Missing button: \(prefix)"); exit(1) }
    check(AXUIElementPerformAction(element, kAXPressAction as CFString) == .success, "Press \(prefix)")
    Thread.sleep(forTimeInterval: 0.25)
}
func key(_ code: CGKeyCode) {
    for down in [true, false] { CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: down)?.postToPid(app.processIdentifier) }
    Thread.sleep(forTimeInterval: 0.25)
}
func click(_ point: CGPoint) {
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
    Thread.sleep(forTimeInterval: 0.3)
}
func choose(_ prefix: String, downCount: Int) {
    guard let select = elements().first(where: { (attr($0, kAXRoleAttribute) as? String) == "AXPopUpButton" && name($0).hasPrefix(prefix) }),
          let positionValue = attr(select, kAXPositionAttribute), let sizeValue = attr(select, kAXSizeAttribute) else { fatalError("Missing picker: \(prefix)") }
    var position = CGPoint.zero; var size = CGSize.zero
    AXValueGetValue(positionValue as! AXValue, .cgPoint, &position)
    AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    let currentIndex = ["跟随系统", "浅色", "深色"].firstIndex(of: attr(select, kAXValueAttribute) as? String ?? "") ?? 0
    // The native menu aligns the selected row with the closed control.
    click(CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2))
    click(CGPoint(x: position.x + size.width / 2 - 10, y: position.y + size.height / 2 + Double(downCount - currentIndex) * 22))
}
func trayClick() {
    guard let barValue = attr(application, "AXExtrasMenuBar") else { fatalError("Daylight status item is unavailable") }
    let bar = barValue as! AXUIElement
    guard let item = (attr(bar, kAXChildrenAttribute) as? [AXUIElement])?.first,
          let positionValue = attr(item, kAXPositionAttribute), let sizeValue = attr(item, kAXSizeAttribute) else { fatalError("Cannot locate Daylight status item") }
    var position = CGPoint.zero; var size = CGSize.zero
    AXValueGetValue(positionValue as! AXValue, .cgPoint, &position)
    AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
    click(CGPoint(x: position.x + size.width / 2, y: position.y + size.height / 2))
}
func noScrollbars() {
    waitFor { elements().contains { (attr($0, kAXRoleAttribute) as? String) == "AXWebArea" } }
    check(elements().contains { (attr($0, kAXRoleAttribute) as? String) == "AXWebArea" }, "Calendar webview is accessible")
    check(!elements().contains { (attr($0, kAXRoleAttribute) as? String) == "AXScrollBar" }, "No native scrollbars in the calendar or dialog")
}
func capture(_ name: String, title: String = "朝夕月历") {
    guard let window = visibleWindows().first(where: { ($0[kCGWindowName as String] as? String) == title }), let number = window[kCGWindowNumber as String] else { fatalError("No capture window") }
    let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture"); process.arguments = ["-x", "-l", String(describing: number), captureDirectory.appendingPathComponent("\(name).png").path]
    try! process.run(); process.waitUntilExit(); check(process.terminationStatus == 0, "Capture \(name)")
}

if !app.isActive { app.activate() }
Thread.sleep(forTimeInterval: 0.3)
key(53); key(53)
if popupVisible() { press("收起月历"); Thread.sleep(forTimeInterval: 0.3) }
noScrollbars()
press("回到今天")
press("设置")
if let toggle = elements().first(where: { (attr($0, kAXRoleAttribute) as? String) == "AXCheckBox" && name($0).hasPrefix("较大字号") }), String(describing: attr(toggle, kAXValueAttribute) ?? "" as CFString) == "1" { press("较大字号") }
press("关闭设置")
capture("daylight-main", title: "朝夕 · Daylight")
trayClick(); waitFor { popupVisible() }; check(popupVisible(), "Menu-bar icon opens the anchored calendar")
press("设置")
if visibleWindows().contains(where: { ($0[kCGWindowName as String] as? String) == "朝夕月历" && (($0[kCGWindowBounds as String] as? [String:Double])?["Height"] ?? 0) > 560 }) { press("较大字号") }
press("关闭设置")
noScrollbars(); capture("daylight-menubar")
press("2026年10月10日")
check(elements().contains { (attr($0, kAXValueAttribute) as? String ?? "").contains("调休上班") }, "Makeup-work date updates the details")
press("上个月"); check(elements().contains { (attr($0, kAXRoleAttribute) as? String) == "AXPopUpButton" && (attr($0, kAXValueAttribute) as? String) == "9 月" }, "Previous month navigates")
press("回到今天")
check(!elements().contains { name($0).contains("日期信息与来源") }, "Source dialog entry is removed")
press("添加日程"); noScrollbars(); capture("daylight-new-event"); press("关闭日程")
press("设置"); noScrollbars(); capture("daylight-settings")
press("较大字号")
waitFor { visibleWindows().contains { ($0[kCGWindowName as String] as? String) == "朝夕月历" && (($0[kCGWindowBounds as String] as? [String:Double])?["Height"] ?? 0) == 640 } }
check(visibleWindows().contains { ($0[kCGWindowName as String] as? String) == "朝夕月历" && (($0[kCGWindowBounds as String] as? [String:Double])?["Height"] ?? 0) == 640 }, "Large text uses a taller popover")
press("关闭设置"); noScrollbars(); capture("daylight-large-text")
press("设置")
press("较大字号"); press("关闭设置")
key(53); waitFor { !popupVisible() }; check(!popupVisible(), "Escape closes the calendar")
Thread.sleep(forTimeInterval: 0.3)
trayClick(); check(popupVisible(), "Calendar reopens from the menu bar")
trayClick(); check(!popupVisible(), "Second menu-bar click closes the calendar")
Thread.sleep(forTimeInterval: 0.3)
trayClick(); check(popupVisible(), "Calendar opens again")
if let window = visibleWindows().first(where: { ($0[kCGWindowName as String] as? String) == "朝夕 · Daylight" }), let bounds = window[kCGWindowBounds as String] as? [String:Double] {
    click(CGPoint(x: (bounds["X"] ?? 0) + (bounds["Width"] ?? 760) - 100, y: (bounds["Y"] ?? 0) + 12))
    waitFor { !popupVisible() }; check(!popupVisible(), "Clicking outside dismisses the calendar")
}
Thread.sleep(forTimeInterval: 0.3)
trayClick(); press("打开独立窗口"); check(!popupVisible(), "Open independent window closes the popover")
noScrollbars()
guard let close = elements().first(where: { (attr($0, kAXSubroleAttribute) as? String) == "AXCloseButton" }) else { fatalError("Cannot locate the independent-window close button") }
check(AXUIElementPerformAction(close, kAXPressAction as CFString) == .success, "Close independent window")
Thread.sleep(forTimeInterval: 0.3)
check(visibleWindows().isEmpty, "Closing the independent window hides it")
trayClick(); check(popupVisible(), "Menu-bar calendar remains available after closing the independent window")
capture("daylight-menubar")
print("Native smoke checks passed")
