`include "fe_types.vh"

// fe_encode.v — Canonical encoding of field elements for Ed25519
// Performs final reduction modulo p = 2^255 - 19,
// then packs into little-endian 256-bit output with sign bit.

module fe_encode (
    input  wire        clk,
    input  wire        rst_n,
    input  wire        start,
    input  fe51_t      y_in,       // Y coordinate (reduced field element)
    input  wire        x_sign,     // LSB of X coordinate (sign bit)
    output reg         ready,
    output reg [255:0] encoded
);
    // Prime p = 2^255 - 19 in limb form
    wire [63:0] p [0:4];
    assign p[0] = 64'h7FFFFFFFFFFED;   // 2^51 - 19
    assign p[1] = 64'h7FFFFFFFFFFFF;   // 2^51 - 1
    assign p[2] = 64'h7FFFFFFFFFFFF;
    assign p[3] = 64'h7FFFFFFFFFFFF;
    assign p[4] = 64'h7FFFFFFFFFFFF;

    // Constant-time comparison: is y_in >= p?
    reg is_ge;
    reg [63:0] y_reduced [0:4];
    reg [63:0] mask;
    reg [63:0] borrow;

    // FSM
    localparam S_IDLE = 2'd0, S_REDUCE = 2'd1, S_PACK = 2'd2, S_DONE = 2'd3;
    reg [1:0] state;

    integer idx;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state   <= S_IDLE;
            ready   <= 1'b0;
            encoded <= 256'd0;
        end else begin
            case (state)
                S_IDLE: begin
                    ready <= 1'b0;
                    if (start) state <= S_REDUCE;
                end

                S_REDUCE: begin
                    // Constant-time: compute y - p, check if borrow occurred
                    // If no borrow (y >= p), use reduced value; else keep original
                    borrow = 0;
                    for (idx = 0; idx < 5; idx = idx + 1) begin
                        {borrow, y_reduced[idx]} = {1'b0, y_in[idx]} - {1'b0, p[idx]} - borrow;
                        borrow = borrow[63]; // Propagate borrow
                    end
                    // is_ge = 1 if y >= p (no final borrow)
                    is_ge = ~borrow;
                    // Constant-time select: mask = all-ones if is_ge, else all-zeros
                    mask = {64{is_ge}};
                    for (idx = 0; idx < 5; idx = idx + 1) begin
                        y_reduced[idx] = (y_reduced[idx] & mask) | (y_in[idx] & ~mask);
                    end
                    state <= S_PACK;
                end

                S_PACK: begin
                    // Pack 5x51-bit limbs into 256-bit little-endian output
                    encoded[50:0]    <= y_reduced[0][50:0];
                    encoded[101:51]  <= y_reduced[1][50:0];
                    encoded[152:102] <= y_reduced[2][50:0];
                    encoded[203:153] <= y_reduced[3][50:0];
                    encoded[254:204] <= y_reduced[4][50:0];
                    // Bit 255 is the sign bit (LSB of X coordinate)
                    encoded[255]     <= x_sign;
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
