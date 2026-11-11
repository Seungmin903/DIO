import ExpoModulesCore
import UIKit

/// 애플펜슬 더블탭(2세대·Pro)을 JS 로 넘긴다. 무엇으로 바꿀지는 JS 가 iPad 설정(preferredTapAction)을 보고 정한다.
/// 에디터가 리스너를 붙인 동안만 앱 창에 UIPencilInteraction 을 단다.
public final class DioPencilModule: Module {
  private var interaction: UIPencilInteraction?
  private lazy var handler = PencilTapHandler { [weak self] in
    self?.sendEvent("onDoubleTap", ["action": PencilTapHandler.preferredAction()])
  }

  public func definition() -> ModuleDefinition {
    Name("DioPencil")
    Events("onDoubleTap")
    OnStartObserving { DispatchQueue.main.async { self.attach() } }
    OnStopObserving { DispatchQueue.main.async { self.detach() } }
    OnDestroy { DispatchQueue.main.async { self.detach() } }
  }

  private func attach() {
    guard interaction == nil, let window = Self.keyWindow() else { return }
    let pencil = UIPencilInteraction()
    pencil.delegate = handler
    window.addInteraction(pencil)
    interaction = pencil
  }

  private func detach() {
    guard let pencil = interaction else { return }
    pencil.view?.removeInteraction(pencil)
    interaction = nil
  }

  private static func keyWindow() -> UIWindow? {
    let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }
    return windows.first { $0.isKeyWindow } ?? windows.first
  }
}

final class PencilTapHandler: NSObject, UIPencilInteractionDelegate {
  private let onTap: () -> Void
  init(onTap: @escaping () -> Void) { self.onTap = onTap }

  // iOS 17.5 부터는 아래 새 메서드만 불린다. 그 전 버전은 예전 메서드가 불린다.
  func pencilInteractionDidTap(_ interaction: UIPencilInteraction) { onTap() }

  @available(iOS 17.5, *)
  func pencilInteraction(_ interaction: UIPencilInteraction, didReceiveTap tap: UIPencilInteraction.Tap) { onTap() }

  static func preferredAction() -> String {
    switch UIPencilInteraction.preferredTapAction {
    case .ignore: return "ignore"
    case .switchEraser: return "switchEraser"
    case .switchPrevious: return "switchPrevious"
    case .showColorPalette: return "showColorPalette"
    case .showInkAttributes: return "showInkAttributes"
    default: return "other"
    }
  }
}
