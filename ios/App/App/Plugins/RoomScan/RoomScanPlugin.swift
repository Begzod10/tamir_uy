import Capacitor
import RoomPlan
import simd

// ---------------------------------------------------------------------------
// MARK: - Capacitor plugin entry point
// ---------------------------------------------------------------------------

@objc(RoomScanPlugin)
public class RoomScanPlugin: CAPPlugin {

    @objc func startScan(_ call: CAPPluginCall) {
        guard RoomCaptureSession.isSupported else {
            call.reject("LIDAR_UNAVAILABLE", "Bu qurilmada LiDAR sensori mavjud emas")
            return
        }

        // keepAlive keeps the JS promise pending while the native UI is on screen.
        call.keepAlive = true

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }

            let captureView = RoomCaptureView(frame: UIScreen.main.bounds)
            let vc = RoomScanViewController(captureView: captureView)

            vc.onComplete = { [weak self] room in
                guard let self else { return }
                do {
                    let json = try self.capturedRoomToJSON(room)
                    DispatchQueue.main.async {
                        self.bridge?.viewController?.dismiss(animated: true)
                        call.resolve(json)
                    }
                } catch {
                    call.reject("JSON_FAILED", error.localizedDescription)
                }
            }

            vc.onCancel = {
                call.reject("USER_CANCELLED", "Foydalanuvchi skanerlashni bekor qildi")
            }

            vc.onError = { err in
                call.reject("CAPTURE_FAILED", err.localizedDescription)
            }

            vc.modalPresentationStyle = .fullScreen
            self.bridge?.viewController?.present(vc, animated: true)
        }
    }

    // -----------------------------------------------------------------------
    // MARK: - CapturedRoom → JSON  (the geometry math lives here)
    // -----------------------------------------------------------------------
    //
    // RoomPlan stores every surface (wall, door, window, opening) as a
    // simd_float4x4 transform in **world space** plus a simd_float3 dimensions
    // vector (width × height × depth).
    //
    // Column layout of the 4×4 matrix (column-major):
    //   col 0 (columns.0) = local X axis in world space  — wall length direction
    //   col 1 (columns.1) = local Y axis in world space  — wall height direction
    //   col 2 (columns.2) = local Z axis in world space  — wall normal (outward)
    //   col 3 (columns.3) = world-space position of the surface's geometric centre
    //
    // To get a 2-D floor-plane segment we:
    //   1. Take the wall centre:     P = (col3.x, col3.z)
    //   2. Take the wall direction:  U = normalize(col0.x, col0.z)
    //   3. Walk ±halfWidth along U:  start = P − halfW·U,  end = P + halfW·U
    //
    // RoomPlan's Y axis points up and the floor sits at Y ≈ 0, so:
    //   sill height for a window = col3.y − dims.y/2
    //   doors flush with the floor have col3.y ≈ dims.y/2, so sill ≈ 0
    //
    // Openings (doors/windows/architectural openings) are stored in flat arrays
    // alongside walls — they are NOT nested inside their parent wall in the API.
    // We assign each opening to a wall by proximity: compute the perpendicular
    // distance from the opening's centre to the infinite line through the wall
    // segment; the opening belongs to the wall whose line it is closest to and
    // whose segment span it projects inside.

    private func capturedRoomToJSON(_ room: CapturedRoom) throws -> [String: Any] {
        // Ceiling height = tallest wall's height (RoomPlan measures to soffit)
        let ceilingHeight = room.walls.map { Double($0.dimensions.y) }.max() ?? 2.7

        var wallsJSON: [[String: Any]] = []

        for wall in room.walls {
            let seg = wallSegment(transform: wall.transform, halfWidth: Double(wall.dimensions.x) / 2)

            var openings: [[String: Any]] = []

            for door in room.doors {
                if let o = projectOpening(
                    oTransform: door.transform, dims: door.dimensions,
                    type: "eshik", wall: seg
                ) { openings.append(o) }
            }

            for window in room.windows {
                if let o = projectOpening(
                    oTransform: window.transform, dims: window.dimensions,
                    type: "deraza", wall: seg
                ) { openings.append(o) }
            }

            for opening in room.openings {
                if let o = projectOpening(
                    oTransform: opening.transform, dims: opening.dimensions,
                    type: "balkon", wall: seg
                ) { openings.append(o) }
            }

            wallsJSON.append([
                "startX":  seg.startX,
                "startZ":  seg.startZ,
                "endX":    seg.endX,
                "endZ":    seg.endZ,
                "heightM": Double(wall.dimensions.y),
                "openings": openings,
            ])
        }

        return [
            "ceilingHeight": ceilingHeight,
            "walls": wallsJSON,
        ]
    }

    // -----------------------------------------------------------------------
    // MARK: - Floor-plane segment extraction
    // -----------------------------------------------------------------------

    private struct WallSeg {
        let startX, startZ, endX, endZ: Double
        // Precomputed unit vector and length for reuse in projections
        let unitX, unitZ, length: Double
    }

    private func wallSegment(transform: simd_float4x4, halfWidth: Double) -> WallSeg {
        let col0 = transform.columns.0   // local X in world space
        let pos  = transform.columns.3   // wall centre

        let cx = Double(pos.x)
        let cz = Double(pos.z)
        let dx = Double(col0.x)
        let dz = Double(col0.z)

        // Normalise the projected direction in the floor plane
        let rawLen = max(1e-6, sqrt(dx * dx + dz * dz))
        let unitX = dx / rawLen
        let unitZ = dz / rawLen

        return WallSeg(
            startX: cx - halfWidth * unitX,
            startZ: cz - halfWidth * unitZ,
            endX:   cx + halfWidth * unitX,
            endZ:   cz + halfWidth * unitZ,
            unitX:  unitX,
            unitZ:  unitZ,
            length: halfWidth * 2
        )
    }

    // -----------------------------------------------------------------------
    // MARK: - Opening projection
    // -----------------------------------------------------------------------

    private func projectOpening(
        oTransform: simd_float4x4,
        dims: simd_float3,
        type oType: String,
        wall: WallSeg
    ) -> [String: Any]? {

        let oPos = oTransform.columns.3
        let ox = Double(oPos.x)
        let oz = Double(oPos.z)
        let oy = Double(oPos.y)

        // Vector from wall start to opening centre in the floor plane
        let dx = ox - wall.startX
        let dz = oz - wall.startZ

        // Perpendicular distance from the opening centre to the wall line
        // (cross product of wall unit and offset, z-component only)
        let perpDist = abs(-wall.unitZ * dx + wall.unitX * dz)

        // Threshold: half the wall depth (~0.2 m) plus a 10 cm tolerance
        if perpDist > 0.35 { return nil }

        // Scalar projection onto the wall direction (signed distance from start)
        let projLen = wall.unitX * dx + wall.unitZ * dz

        // Reject if the opening centre falls clearly outside the wall segment
        let widthM  = Double(dims.x)
        let halfW   = widthM / 2
        if projLen + halfW < -0.05 || projLen - halfW > wall.length + 0.05 { return nil }

        // Left edge of opening measured from the wall's start vertex
        let offsetM = max(0.0, projLen - halfW)

        // Sill height: vertical distance from floor (Y=0) to the bottom of the opening
        let heightM = Double(dims.y)
        let sillM   = max(0.0, oy - heightM / 2.0)

        return [
            "type":    oType,
            "offsetM": offsetM,
            "widthM":  widthM,
            "heightM": heightM,
            "sillM":   sillM,
        ]
    }
}

// ---------------------------------------------------------------------------
// MARK: - UIViewController hosting RoomCaptureView
// ---------------------------------------------------------------------------

private final class RoomScanViewController: UIViewController, RoomCaptureViewDelegate {

    var onComplete: ((CapturedRoom) -> Void)?
    var onCancel:   (() -> Void)?
    var onError:    ((Error) -> Void)?

    private let captureView: RoomCaptureView
    private var scanCompleted = false

    init(captureView: RoomCaptureView) {
        self.captureView = captureView
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        captureView.frame = view.bounds
        captureView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        captureView.delegate = self
        view.addSubview(captureView)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        let config = RoomCaptureSession.Configuration()
        captureView.captureSession.run(configuration: config)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        captureView.captureSession.stop()
        if !scanCompleted { onCancel?() }
    }

    // ── RoomCaptureViewDelegate ──

    // Called when the user taps "Done" inside RoomCaptureView.
    // Return true to let RoomPlan run its post-processing step.
    func captureView(shouldPresent roomDataForProcessing: CapturedRoomData, error: Error?) -> Bool {
        if let error { onError?(error); return false }
        return true
    }

    // Called after RoomPlan finishes building the CapturedRoom model.
    func captureView(didPresent processedResult: CapturedRoom, error: Error?) {
        if let error { onError?(error); return }
        scanCompleted = true
        onComplete?(processedResult)
    }
}
