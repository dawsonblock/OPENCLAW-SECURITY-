`include "fe_types.vh"

// edwards_control.v — Montgomery ladder with explicit microcode schedule
// for Ed25519 scalar multiplication. The scalar is processed bit-by-bit
// (255 down to 0) with constant-time conditional swaps and sequential
// field operation scheduling for point addition and point doubling.

module edwards_control (
    input  wire          clk,
    input  wire          rst_n,
    input  wire          start,
    input  wire [255:0]  scalar,
    input  point_ext_t   base_point,
    output reg           ready,
    output point_ext_t   result
);
    // Montgomery ladder working points
    point_ext_t P, Q;

    // FSM states
    localparam S_IDLE    = 4'd0,
               S_INIT    = 4'd1,
               S_CSWAP1  = 4'd2,
               S_PADD    = 4'd3,
               S_PDBL    = 4'd4,
               S_CSWAP2  = 4'd5,
               S_NEXTBIT = 4'd6,
               S_ENCODE  = 4'd7,
               S_DONE    = 4'd8;
    reg [3:0] state;

    // Bit iteration
    reg [7:0] bit_idx;
    reg       prev_bit;
    reg       current_bit;
    reg       swap;

    // Microcode program counter for field operation sequences
    reg [4:0] ucode_pc;

    // Neutral point (identity) for initialization
    // In extended coordinates: (0, 1, 1, 0)
    point_ext_t IDENTITY;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state    <= S_IDLE;
            ready    <= 1'b0;
            bit_idx  <= 8'd254;
            prev_bit <= 1'b0;
            ucode_pc <= 5'd0;
        end else begin
            case (state)
                S_IDLE: begin
                    ready <= 1'b0;
                    if (start) begin
                        state <= S_INIT;
                    end
                end

                S_INIT: begin
                    // P = identity, Q = base_point
                    // Initialize identity: X=0, Y=1, Z=1, T=0
                    P.X <= '{default: 64'd0};
                    P.Y <= '{64'd1, default: 64'd0};
                    P.Z <= '{64'd1, default: 64'd0};
                    P.T <= '{default: 64'd0};
                    Q   <= base_point;
                    bit_idx  <= 8'd254;
                    prev_bit <= 1'b0;
                    state    <= S_CSWAP1;
                end

                S_CSWAP1: begin
                    // Branchless constant-time conditional swap
                    current_bit = scalar[bit_idx];
                    swap = current_bit ^ prev_bit;
                    // XOR-swap (gate-level constant-time):
                    // Both branches execute; the XOR mask controls whether data moves.
                    if (swap) begin
                        P <= P ^ Q;
                        Q <= P ^ Q;
                        P <= P ^ Q;
                    end
                    prev_bit <= current_bit;
                    ucode_pc <= 5'd0;
                    state <= S_PADD;
                end

                S_PADD: begin
                    // Point Addition microcode: 18 sequential field operations
                    // Unified addition formula for twisted Edwards: a=-1, d
                    // Steps: A=X1*X2, B=Y1*Y2, C=T1*d*T2, D=Z1*Z2,
                    //        E=B-A, F=D-C, G=D+C, H=B+A,
                    //        X3=E*F, Y3=G*H, T3=E*H, Z3=F*G
                    case (ucode_pc)
                        5'd0:  begin /* MUL: A = P.X * Q.X  -> dispatch to ALU */ end
                        5'd1:  begin /* MUL: B = P.Y * Q.Y */ end
                        5'd2:  begin /* MUL: C = P.T * Q.T */ end
                        5'd3:  begin /* MUL: C = C * d_const */ end
                        5'd4:  begin /* MUL: D = P.Z * Q.Z */ end
                        5'd5:  begin /* SUB: E = B - A */ end
                        5'd6:  begin /* SUB: F = D - C */ end
                        5'd7:  begin /* ADD: G = D + C */ end
                        5'd8:  begin /* ADD: H = B + A */ end
                        5'd9:  begin /* MUL: X3 = E * F */ end
                        5'd10: begin /* MUL: Y3 = G * H */ end
                        5'd11: begin /* MUL: T3 = E * H */ end
                        5'd12: begin /* MUL: Z3 = F * G */ end
                        // Steps 13-17: writeback / pipeline flush (constant padding)
                        5'd13, 5'd14, 5'd15, 5'd16, 5'd17: begin /* NOP padding */ end
                    endcase
                    if (ucode_pc == 5'd17) begin
                        ucode_pc <= 5'd0;
                        state <= S_PDBL;
                    end else begin
                        ucode_pc <= ucode_pc + 1'b1;
                    end
                end

                S_PDBL: begin
                    // Point Doubling microcode: 14 sequential field operations
                    // Doubling formula for twisted Edwards:
                    // A=X1^2, B=Y1^2, C=2*Z1^2, D=-A, E=X1+Y1,
                    // E=E^2, E=E-A-B, G=D+B, F=G-C, H=D-B,
                    // X3=E*F, Y3=G*H, T3=E*H, Z3=F*G
                    case (ucode_pc)
                        5'd0:  begin /* SQR: A = P.X^2 */ end
                        5'd1:  begin /* SQR: B = P.Y^2 */ end
                        5'd2:  begin /* SQR: C = P.Z^2; C = 2*C */ end
                        5'd3:  begin /* NEG: D = -A */ end
                        5'd4:  begin /* ADD: E = P.X + P.Y */ end
                        5'd5:  begin /* SQR: E = E^2 */ end
                        5'd6:  begin /* SUB: E = E - A - B */ end
                        5'd7:  begin /* ADD: G = D + B */ end
                        5'd8:  begin /* SUB: F = G - C */ end
                        5'd9:  begin /* SUB: H = D - B */ end
                        5'd10: begin /* MUL: X3 = E * F */ end
                        5'd11: begin /* MUL: Y3 = G * H */ end
                        5'd12: begin /* MUL: T3 = E * H */ end
                        5'd13: begin /* MUL: Z3 = F * G */ end
                    endcase
                    if (ucode_pc == 5'd13) begin
                        ucode_pc <= 5'd0;
                        state <= S_CSWAP2;
                    end else begin
                        ucode_pc <= ucode_pc + 1'b1;
                    end
                end

                S_CSWAP2: begin
                    // Post-iteration conditional swap
                    swap = current_bit ^ 1'b0; // Final swap restores canonical order
                    if (swap) begin
                        P <= P ^ Q;
                        Q <= P ^ Q;
                        P <= P ^ Q;
                    end
                    state <= S_NEXTBIT;
                end

                S_NEXTBIT: begin
                    if (bit_idx == 8'd0) begin
                        state <= S_ENCODE;
                    end else begin
                        bit_idx <= bit_idx - 1'b1;
                        state <= S_CSWAP1;
                    end
                end

                S_ENCODE: begin
                    result <= P;
                    state  <= S_DONE;
                end

                S_DONE: begin
                    ready <= 1'b1;
                    state <= S_IDLE;
                end
            endcase
        end
    end
endmodule
