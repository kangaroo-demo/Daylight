import AppKit
import ApplicationServices

// Read only Daylight's accessibility tree; never inspect unrelated app windows.
let process = NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == "app.daylight.calendar" }
guard let process = process else { fatalError("Daylight is not running") }
let application = AXUIElementCreateApplication(process.processIdentifier)
AXUIElementSetAttributeValue(application, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(element, name as CFString, &value)
    return value
}
func dumpTree(_ element: AXUIElement, _ depth: Int = 0) {
    guard depth < 20 else { return }
    let role = attribute(element, kAXRoleAttribute) as? String ?? ""
    let name = (attribute(element, kAXTitleAttribute) as? String ?? "") + " " + (attribute(element, kAXDescriptionAttribute) as? String ?? "")
    let value = attribute(element, kAXValueAttribute) as? String ?? ""
    print(String(repeating: " ", count: depth) + role + " | " + name + " | " + value)
    for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] { dumpTree(child, depth + 1) }
}
for window in attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? [] { dumpTree(window) }

let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String:Any]] ?? []
for window in windows where window[kCGWindowOwnerPID as String] as? Int32 == process.processIdentifier {
    if let number = window[kCGWindowNumber as String] { print("DAYLIGHT_WINDOW_ID=\(number)") }
}
