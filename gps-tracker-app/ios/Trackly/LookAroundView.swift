import MapKit
import UIKit
import React

@objc(LookAroundView)
class LookAroundView: UIView {
    var lookAroundViewController: MKLookAroundViewController?

    override func layoutSubviews() {
        super.layoutSubviews()
        lookAroundViewController?.view.frame = self.bounds
    }

    @objc func setCoordinate(_ coordinate: NSDictionary) {
        let lat = coordinate["latitude"] as? Double ?? 0
        let lon = coordinate["longitude"] as? Double ?? 0
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lon)
        
        let request = MKLookAroundSceneRequest(coordinate: center)
        Task {
            do {
                if let scene = try await request.scene {
                    DispatchQueue.main.async {
                        self.setupController(scene: scene)
                    }
                }
            } catch {
                print("[LookAround] Scene not found for \(center)")
            }
        }
    }

    private func setupController(scene: MKLookAroundScene) {
        if let existing = lookAroundViewController {
            existing.scene = scene
            return
        }

        let vc = MKLookAroundViewController(scene: scene)
        if let parentVC = self.reactViewController() {
            parentVC.addChild(vc)
            self.addSubview(vc.view)
            vc.view.frame = self.bounds
            vc.didMove(toParent: parentVC)
            self.lookAroundViewController = vc
        }
    }
}
