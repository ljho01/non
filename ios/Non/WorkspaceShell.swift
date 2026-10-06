import SwiftUI

struct WorkspaceShell: View {
    @State private var webController = WebWorkspaceController()

    var body: some View {
        NavigationStack {
            WebWorkspaceView(controller: webController)
                .background(Color(.systemBackground))
                .navigationTitle("Non")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button {
                            webController.send(action: "library")
                        } label: {
                            Image(systemName: "sidebar.left")
                        }
                        .accessibilityLabel("문서")
                        .accessibilityIdentifier("native-library")
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            webController.send(action: "assistant")
                        } label: {
                            Image(systemName: "sparkles")
                        }
                        .accessibilityLabel("AI")
                        .accessibilityIdentifier("native-assistant")
                    }
                }
        }
        .tint(.primary)
    }
}

#Preview {
    WorkspaceShell()
}
