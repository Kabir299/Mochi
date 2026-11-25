import CallKit
import ExpoModulesCore

// CallKit says when a call is ringing or going on, without any permission.
public final class MochiCallStateModule: Module {
  private let observer = CXCallObserver()

  public func definition() -> ModuleDefinition {
    Name("MochiCallState")

    Function("inCall") { () -> Bool in
      return self.observer.calls.contains { !$0.hasEnded }
    }
  }
}
