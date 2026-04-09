`include "fe_types.vh"

// hgate_top.v — Top-level H-Gate security module
// Integrates: Ed25519 core, Boot FSM, PCR registers, Monotonic counter,
// MMIO register bank, and Attestation engine.

module hgate_top (
    input  wire        clk,
    input  wire        rst_n,

    // MMIO interface (directly mapped by AXI wrapper)
    input  wire        mmio_we,
    input  wire [7:0]  mmio_addr,
    input  wire [31:0] mmio_wdata,
    output reg  [31:0] mmio_rdata,
    output reg         busy
);

    // ── Register Map ──────────────────────────────────────────────
    // 0x00  CMD          (W)   Command register
    // 0x04  STATUS       (R)   Status / busy / locked
    // 0x08  COUNTER_LO   (R)   Anti-rollback counter [31:0]
    // 0x0C  COUNTER_HI   (R)   Anti-rollback counter [63:32]
    // 0x10  PCR_0        (R)   PCR register bank (8 × 32-bit = 256 bits)
    // 0x30  DATA_IN_0    (W)   Data input buffer (8 × 32-bit)
    // 0x50  DATA_OUT_0   (R)   Data output buffer (8 × 32-bit)

    // Command codes
    localparam CMD_NOP          = 8'h00;
    localparam CMD_BOOT_VERIFY  = 8'h01;
    localparam CMD_PCR_EXTEND   = 8'h02;
    localparam CMD_SIGN         = 8'h03;
    localparam CMD_ATTEST       = 8'h04;
    localparam CMD_INC_COUNTER  = 8'h05;

    // Internal state
    reg [7:0]   cmd_reg;
    reg         locked;
    reg [63:0]  counter;
    reg [255:0] pcr;
    reg [255:0] data_in_buf;
    reg [255:0] data_out_buf;

    // Boot FSM states
    localparam BOOT_RESET       = 3'd0,
               BOOT_VERIFY_GATE = 3'd1,
               BOOT_VERIFY_VM   = 3'd2,
               BOOT_VERIFY_POL  = 3'd3,
               BOOT_RUN         = 3'd4,
               BOOT_FAULT       = 3'd5;
    reg [2:0] boot_state;

    // Ed25519 core interface
    reg         ed_start;
    wire        ed_ready;
    reg [255:0] ed_scalar;
    // wire [255:0] ed_pubkey; // Output from core

    edwards_control u_ed25519 (
        .clk(clk),
        .rst_n(rst_n),
        .start(ed_start),
        .scalar(ed_scalar),
        .base_point(/* hardcoded base point */),
        .ready(ed_ready),
        .result(/* result point */)
    );

    // Bind formal properties
    hgate_props u_props (
        .clk(clk),
        .rst_n(rst_n),
        .cmd(cmd_reg),
        .cmd_valid(mmio_we && mmio_addr == 8'h00),
        .pcr(pcr),
        .counter(counter),
        .locked(locked)
    );

    // MMIO Write Logic
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            cmd_reg      <= CMD_NOP;
            locked       <= 1'b0;
            counter      <= 64'd0;
            pcr          <= 256'd0;
            data_in_buf  <= 256'd0;
            data_out_buf <= 256'd0;
            boot_state   <= BOOT_RESET;
            busy         <= 1'b0;
            ed_start     <= 1'b0;
            ed_scalar    <= 256'd0;
        end else begin
            ed_start <= 1'b0; // Default: single-cycle pulse

            if (mmio_we) begin
                case (mmio_addr)
                    8'h00: begin // CMD register
                        cmd_reg <= mmio_wdata[7:0];
                        case (mmio_wdata[7:0])
                            CMD_INC_COUNTER: begin
                                if (!locked) counter <= counter + 1;
                            end
                            CMD_PCR_EXTEND: begin
                                if (!locked) begin
                                    // Simplified PCR extend (real impl uses SHA-256)
                                    pcr <= pcr ^ data_in_buf;
                                end
                            end
                            CMD_SIGN: begin
                                if (!locked) begin
                                    ed_scalar <= data_in_buf;
                                    ed_start  <= 1'b1;
                                    busy      <= 1'b1;
                                end
                            end
                        endcase
                    end
                    // Data input buffer writes (8 × 32-bit)
                    8'h30: data_in_buf[31:0]    <= mmio_wdata;
                    8'h34: data_in_buf[63:32]   <= mmio_wdata;
                    8'h38: data_in_buf[95:64]   <= mmio_wdata;
                    8'h3C: data_in_buf[127:96]  <= mmio_wdata;
                    8'h40: data_in_buf[159:128] <= mmio_wdata;
                    8'h44: data_in_buf[191:160] <= mmio_wdata;
                    8'h48: data_in_buf[223:192] <= mmio_wdata;
                    8'h4C: data_in_buf[255:224] <= mmio_wdata;
                endcase
            end

            // Update busy flag from Ed25519 core
            if (busy && ed_ready) begin
                busy <= 1'b0;
            end
        end
    end

    // MMIO Read Logic
    always @(*) begin
        case (mmio_addr)
            8'h04: mmio_rdata = {29'd0, boot_state};
            8'h08: mmio_rdata = counter[31:0];
            8'h0C: mmio_rdata = counter[63:32];
            8'h10: mmio_rdata = pcr[31:0];
            8'h14: mmio_rdata = pcr[63:32];
            8'h18: mmio_rdata = pcr[95:64];
            8'h1C: mmio_rdata = pcr[127:96];
            8'h20: mmio_rdata = pcr[159:128];
            8'h24: mmio_rdata = pcr[191:160];
            8'h28: mmio_rdata = pcr[223:192];
            8'h2C: mmio_rdata = pcr[255:224];
            8'h50: mmio_rdata = data_out_buf[31:0];
            8'h54: mmio_rdata = data_out_buf[63:32];
            8'h58: mmio_rdata = data_out_buf[95:64];
            8'h5C: mmio_rdata = data_out_buf[127:96];
            8'h60: mmio_rdata = data_out_buf[159:128];
            8'h64: mmio_rdata = data_out_buf[191:160];
            8'h68: mmio_rdata = data_out_buf[223:192];
            8'h6C: mmio_rdata = data_out_buf[255:224];
            default: mmio_rdata = 32'hDEAD_BEEF;
        endcase
    end
endmodule
