`include "fe_types.vh"

// mul_schedule_rom.v — Deterministic schedule ROM for schoolbook multiplication
// Maps cycle index k (0..24) to limb indices (i,j) for partial product a[i]*b[j].
// Ensures a fixed, data-independent ordering of 25 partial products.

module mul_schedule_rom (
    input  wire [4:0] k,
    output reg  [2:0] i_out,
    output reg  [2:0] j_out
);
    always @(*) begin
        case (k)
            5'd0:  begin i_out = 0; j_out = 0; end
            5'd1:  begin i_out = 0; j_out = 1; end
            5'd2:  begin i_out = 0; j_out = 2; end
            5'd3:  begin i_out = 0; j_out = 3; end
            5'd4:  begin i_out = 0; j_out = 4; end
            5'd5:  begin i_out = 1; j_out = 0; end
            5'd6:  begin i_out = 1; j_out = 1; end
            5'd7:  begin i_out = 1; j_out = 2; end
            5'd8:  begin i_out = 1; j_out = 3; end
            5'd9:  begin i_out = 1; j_out = 4; end
            5'd10: begin i_out = 2; j_out = 0; end
            5'd11: begin i_out = 2; j_out = 1; end
            5'd12: begin i_out = 2; j_out = 2; end
            5'd13: begin i_out = 2; j_out = 3; end
            5'd14: begin i_out = 2; j_out = 4; end
            5'd15: begin i_out = 3; j_out = 0; end
            5'd16: begin i_out = 3; j_out = 1; end
            5'd17: begin i_out = 3; j_out = 2; end
            5'd18: begin i_out = 3; j_out = 3; end
            5'd19: begin i_out = 3; j_out = 4; end
            5'd20: begin i_out = 4; j_out = 0; end
            5'd21: begin i_out = 4; j_out = 1; end
            5'd22: begin i_out = 4; j_out = 2; end
            5'd23: begin i_out = 4; j_out = 3; end
            5'd24: begin i_out = 4; j_out = 4; end
            default: begin i_out = 0; j_out = 0; end
        endcase
    end
endmodule
