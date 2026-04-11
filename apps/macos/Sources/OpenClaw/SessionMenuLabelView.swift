import SwiftUI

private struct MenuItemHighlightedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var menuItemHighlighted: Bool {
        get { self[MenuItemHighlightedKey.self] }
        set { self[MenuItemHighlightedKey.self] = newValue }
    }
}

/// Small colored pill showing the operator lane name (triage / coder / admin).
private struct OperatorLaneBadge: View {
    let laneId: String
    let tint: Color
    let isHighlighted: Bool

    var body: some View {
        Text(self.laneId)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(self.isHighlighted ? .white : self.tint)
            .padding(.horizontal, 5)
            .padding(.vertical, 1)
            .background(
                Capsule()
                    .fill(self.isHighlighted ? self.tint.opacity(0.7) : self.tint.opacity(0.15))
            )
    }
}

struct SessionMenuLabelView: View {
    let row: SessionRow
    let width: CGFloat
    @Environment(\.menuItemHighlighted) private var isHighlighted
    private let paddingLeading: CGFloat = 22
    private let paddingTrailing: CGFloat = 14
    private let barHeight: CGFloat = 6

    private var primaryTextColor: Color {
        self.isHighlighted ? Color(nsColor: .selectedMenuItemTextColor) : .primary
    }

    private var secondaryTextColor: Color {
        self.isHighlighted ? Color(nsColor: .selectedMenuItemTextColor).opacity(0.85) : .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ContextUsageBar(
                usedTokens: self.row.tokens.total,
                contextTokens: self.row.tokens.contextTokens,
                width: max(1, self.width - (self.paddingLeading + self.paddingTrailing)),
                height: self.barHeight)

            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(self.row.label)
                    .font(.caption.weight(self.row.key == "main" ? .semibold : .regular))
                    .foregroundStyle(self.primaryTextColor)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .layoutPriority(1)

                // Operator lane badge (triage / coder / admin)
                if let laneId = self.row.operatorLaneId {
                    OperatorLaneBadge(
                        laneId: laneId,
                        tint: self.row.kind.tint,
                        isHighlighted: self.isHighlighted)
                    .padding(.leading, 3)
                }

                Spacer(minLength: 4)

                Text("\(self.row.tokens.contextSummaryShort) · \(self.row.ageText)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(self.secondaryTextColor)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .layoutPriority(2)

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(self.secondaryTextColor)
                    .padding(.leading, 2)
            }
        }
        .padding(.vertical, 10)
        .padding(.leading, self.paddingLeading)
        .padding(.trailing, self.paddingTrailing)
    }
}
