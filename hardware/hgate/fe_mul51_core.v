`include "fe_types.vh"

// fe_mul51_core.v — Constant-time field multiplier for GF(2^255-19)
// Uses 128-bit accumulators, 25-cycle schoolbook multiplication,
// reduction via 2^255 ≡ 19, and double-pass carry chain.

module fe_mul51_core (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    input  fe51_t      a,
    input  fe51_t      b,
    output reg         ready,
    output fe51_t      out
);
    localparam [63:0] LIMB_MASK = 64'h0007FFFFFFFFFFFF; // (1 << 51) - 1

    // 128-bit accumulators for convolution bins (indices 0..8)
    reg [127:0] acc [0:8];

    // Schedule ROM wires
    wire [2:0] sched_i, sched_j;
    reg  [4:0] step_cnt;

    // FSM
    localparam S_IDLE    = 3'd0,
               S_ACCUM   = 3'd1,
               S_FOLD    = 3'd2,
               S_CARRY1  = 3'd3,
               S_CARRY2  = 3'd4,
               S_DONE    = 3'd5;
    reg [2:0] state;

    mul_schedule_rom u_sched (
        .k(step_cnt),
        .i_out(sched_i),
        .j_out(sched_j)
    );

    // Intermediate carry storage
    reg [127:0] c [0:4];
    reg [127:0] carry;

    integer idx;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state    <= S_IDLE;
            ready    <= 1'b0;
            step_cnt <= 5'd0;
            for (idx = 0; idx < 9; idx = idx + 1) acc[idx] <= 128'd0;
            for (idx = 0; idx < 5; idx = idx + 1) begin
                c[idx]   <= 128'd0;
                out[idx] <= 64'd0;
            end
        end else begin
            case (state)
                S_IDLE: begin
                    ready <= 1'b0;
                    if (start) begin
                        step_cnt <= 5'd0;
                        for (idx = 0; idx < 9; idx = idx + 1) acc[idx] <= 128'd0;
                        state <= S_ACCUM;
                    end
                end

                S_ACCUM: begin
                    // Accumulate partial product into bin T = i + j
                    acc[sched_i + sched_j] <= acc[sched_i + sched_j] + (a[sched_i] * b[sched_j]);
                    if (step_cnt == 5'd24) begin
                        state <= S_FOLD;
                    end else begin
                        step_cnt <= step_cnt + 1'b1;
                    end
                end

                S_FOLD: begin
                    // Fold high bins: 2^(51*k) for k>=5 wraps as 2^255 * 2^(51*(k-5))
                    // 2^255 ≡ 19 (mod p)
                    c[0] <= acc[0] + 128'd19 * acc[5];
                    c[1] <= acc[1] + 128'd19 * acc[6];
                    c[2] <= acc[2] + 128'd19 * acc[7];
                    c[3] <= acc[3] + 128'd19 * acc[8];
                    c[4] <= acc[4]; // No fold needed for bin 4
                    state <= S_CARRY1;
                end

                S_CARRY1: begin
                    // First carry propagation pass
                    carry = c[0] >> 51; c[0] = c[0] & {64'd0, LIMB_MASK};
                    c[1] = c[1] + carry;
                    carry = c[1] >> 51; c[1] = c[1] & {64'd0, LIMB_MASK};
                    c[2] = c[2] + carry;
                    carry = c[2] >> 51; c[2] = c[2] & {64'd0, LIMB_MASK};
                    c[3] = c[3] + carry;
                    carry = c[3] >> 51; c[3] = c[3] & {64'd0, LIMB_MASK};
                    c[4] = c[4] + carry;
                    carry = c[4] >> 51; c[4] = c[4] & {64'd0, LIMB_MASK};
                    // Wrap top carry: carry * 19 back into limb 0
                    c[0] = c[0] + carry * 128'd19;
                    state <= S_CARRY2;
                end

                S_CARRY2: begin
                    // Second carry pass to fully reduce
                    carry = c[0] >> 51;
                    out[0] <= c[0][63:0] & LIMB_MASK;
                    c[1] = c[1] + carry;
                    carry = c[1] >> 51;
                    out[1] <= c[1][63:0] & LIMB_MASK;
                    c[2] = c[2] + carry;
                    carry = c[2] >> 51;
                    out[2] <= c[2][63:0] & LIMB_MASK;
                    c[3] = c[3] + carry;
                    carry = c[3] >> 51;
                    out[3] <= c[3][63:0] & LIMB_MASK;
                    c[4] = c[4] + carry;
                    out[4] <= c[4][63:0] & LIMB_MASK;
                    state <= S_DONE;
                end

                S_DONE: begin
                    ready <= 1'b1;
                    state <= S_IDLE;
                end
            endcase
        end
    end
endmodule
