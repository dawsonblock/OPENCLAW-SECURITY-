import SwiftUI

// MARK: - Receipt Detection

/// Identifies which operator lane a structured receipt belongs to.
enum OperatorReceiptKind {
    case triage, coder, admin

    /// Attempt to detect the receipt kind from a raw message string.
    static func detect(in text: String) -> OperatorReceiptKind? {
        if text.contains("🧩 Triage Receipt") || text.contains("## Triage Receipt") {
            return .triage
        }
        if text.contains("🛠️ Coding Receipt") || text.contains("## Coding Receipt") {
            return .coder
        }
        if text.contains("🛡️ Status Receipt") || text.contains("## Status Receipt") {
            return .admin
        }
        return nil
    }

    var title: String {
        switch self {
        case .triage: "Triage Receipt"
        case .coder: "Coding Receipt"
        case .admin: "Status Receipt"
        }
    }

    var icon: String {
        switch self {
        case .triage: "arrow.triangle.branch"
        case .coder: "hammer"
        case .admin: "shield.checkmark"
        }
    }

    var tint: Color {
        switch self {
        case .triage: .indigo
        case .coder: .teal
        case .admin: .orange
        }
    }
}

// MARK: - Simple receipt field extractor

/// Parses `**FieldName**: value` lines from markdown receipt text.
private func extractReceiptField(_ fieldName: String, from text: String) -> String? {
    let patterns = [
        "\\*\\*\(fieldName)\\*\\*:\\s*(.+)",
        "\(fieldName):\\s*(.+)",
    ]
    for pattern in patterns {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: .caseInsensitive) else {
            continue
        }
        let range = NSRange(text.startIndex..., in: text)
        if let match = regex.firstMatch(in: text, range: range),
           let valueRange = Range(match.range(at: 1), in: text)
        {
            let value = String(text[valueRange])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { return value }
        }
    }
    return nil
}

// MARK: - Receipt model

struct ParsedOperatorReceipt {
    let kind: OperatorReceiptKind
    let status: String?
    let targetAgent: String?
    let rationale: String?

    static func parse(kind: OperatorReceiptKind, from text: String) -> ParsedOperatorReceipt {
        ParsedOperatorReceipt(
            kind: kind,
            status: extractReceiptField("Status", from: text)
                ?? extractReceiptField("Result", from: text),
            targetAgent: extractReceiptField("Target Agent", from: text)
                ?? extractReceiptField("Agent", from: text),
            rationale: extractReceiptField("Rationale", from: text)
                ?? extractReceiptField("Summary", from: text))
    }
}

// MARK: - View

/// Renders a structured operator receipt as a compact, colored card.
/// Falls back to nil if the text does not contain a recognized receipt marker.
struct OperatorReceiptView: View {
    let receipt: ParsedOperatorReceipt
    let width: CGFloat
    @Environment(\.menuItemHighlighted) private var isHighlighted

    private var cardTint: Color { self.receipt.kind.tint }

    private var headerBackground: Color {
        self.isHighlighted
            ? self.cardTint.opacity(0.5)
            : self.cardTint.opacity(0.12)
    }

    private var bodyTextColor: Color {
        self.isHighlighted
            ? Color(nsColor: .selectedMenuItemTextColor)
            : Color(nsColor: .labelColor)
    }

    private var secondaryTextColor: Color {
        self.isHighlighted
            ? Color(nsColor: .selectedMenuItemTextColor).opacity(0.85)
            : Color(nsColor: .secondaryLabelColor)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header bar
            HStack(spacing: 5) {
                Image(systemName: self.receipt.kind.icon)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(self.cardTint)

                Text(self.receipt.kind.title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(self.cardTint)

                Spacer(minLength: 4)

                if let status = self.receipt.status {
                    Text(status)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(self.cardTint)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Capsule().fill(self.cardTint.opacity(0.15)))
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(self.headerBackground)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous)
                .inset(by: 0))

            // Body
            VStack(alignment: .leading, spacing: 3) {
                if let targetAgent = self.receipt.targetAgent {
                    HStack(alignment: .top, spacing: 4) {
                        Text("→")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(self.secondaryTextColor)
                        Text(targetAgent)
                            .font(.caption2)
                            .foregroundStyle(self.bodyTextColor)
                            .lineLimit(1)
                    }
                }

                if let rationale = self.receipt.rationale {
                    Text(rationale)
                        .font(.caption)
                        .foregroundStyle(self.secondaryTextColor)
                        .lineLimit(3)
                        .truncationMode(.tail)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 8)
            .padding(.top, 4)
            .padding(.bottom, 2)
        }
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .strokeBorder(self.cardTint.opacity(0.2), lineWidth: 0.5)
        )
        .padding(.vertical, 2)
        .frame(width: max(1, self.width), alignment: .leading)
    }

    /// Returns nil when the text does not contain a recognized receipt.
    static func parseIfReceipt(text: String, width: CGFloat) -> OperatorReceiptView? {
        guard let kind = OperatorReceiptKind.detect(in: text) else { return nil }
        let receipt = ParsedOperatorReceipt.parse(kind: kind, from: text)
        return OperatorReceiptView(receipt: receipt, width: width)
    }
}
