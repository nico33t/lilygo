import MapKit
import UIKit
import React

@objc(LookAroundView)
class LookAroundView: UIView {
    private var _lookAroundViewController: Any?
    @objc var onSceneChange: RCTDirectEventBlock?

    @available(iOS 16.0, *)
    var lookAroundViewController: MKLookAroundViewController? {
        get { return _lookAroundViewController as? MKLookAroundViewController }
        set { _lookAroundViewController = newValue }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        if #available(iOS 16.0, *) {
            lookAroundViewController?.view.frame = self.bounds
            hideLookAroundBadgeIfPresent()
        }
    }

    @objc func setCoordinate(_ coordinate: NSDictionary) {
        guard #available(iOS 16.0, *) else { return }
        
        let lat = coordinate["latitude"] as? Double ?? 0
        let lon = coordinate["longitude"] as? Double ?? 0
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        
        let request = MKLookAroundSceneRequest(coordinate: center)
        print("[LookAround] Requesting scene for \(center)...")
        Task {
            do {
                let scene = try await request.scene
                if let actualScene = scene {
                    print("[LookAround] Scene FOUND for \(center)")
                    DispatchQueue.main.async {
                        self.setupController(scene: actualScene)
                        self.onSceneChange?(["available": true])
                    }
                } else {
                    print("[LookAround] Scene NOT available for \(center)")
                    DispatchQueue.main.async {
                        self.onSceneChange?(["available": false])
                    }
                }
            } catch {
                print("[LookAround] Error requesting scene: \(error)")
                DispatchQueue.main.async {
                    self.onSceneChange?(["available": false])
                }
            }
        }
    }

    @available(iOS 16.0, *)
    private func setupController(scene: MKLookAroundScene) {
        if let existing = lookAroundViewController {
            existing.scene = scene
            existing.badgePosition = .bottomTrailing
            hideLookAroundBadgeIfPresent()
            return
        }

        let vc = MKLookAroundViewController(scene: scene)
        vc.badgePosition = .bottomTrailing
        vc.showsRoadLabels = false
        vc.pointOfInterestFilter = .excludingAll
        if let parentVC = self.reactViewController() {
            parentVC.addChild(vc)
            self.addSubview(vc.view)
            vc.view.frame = self.bounds
            vc.didMove(toParent: parentVC)
            self.lookAroundViewController = vc
            hideLookAroundBadgeIfPresent()
        }
    }

    @available(iOS 16.0, *)
    private func hideLookAroundBadgeIfPresent() {
        guard let root = lookAroundViewController?.view else { return }

        func walk(_ view: UIView) {
            let className = NSStringFromClass(type(of: view))
            let lowered = className.lowercased()

            if lowered.contains("lookaround") && lowered.contains("badge") {
                view.isHidden = true
                view.alpha = 0
                return
            }

            if let label = view as? UILabel {
                let txt = (label.text ?? "").lowercased()
                if txt.contains("look around") {
                    view.isHidden = true
                    view.alpha = 0
                    return
                }
            }

            if let button = view as? UIButton {
                let txt = (button.currentTitle ?? "").lowercased()
                if txt.contains("look around") {
                    view.isHidden = true
                    view.alpha = 0
                    return
                }
            }

            for child in view.subviews {
                walk(child)
            }
        }

        walk(root)
    }
}
