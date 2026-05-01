import React

@objc(LookAroundViewManager)
class LookAroundViewManager: RCTViewManager {
    override func view() -> UIView! {
        return LookAroundView()
    }

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
}
