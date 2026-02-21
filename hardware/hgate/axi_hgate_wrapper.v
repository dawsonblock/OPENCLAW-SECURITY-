module axi_hgate_wrapper #(
    parameter C_S_AXI_DATA_WIDTH = 32,
    parameter C_S_AXI_ADDR_WIDTH = 8
)(
    // AXI4-Lite Clock and Reset
    input  wire  S_AXI_ACLK,
    input  wire  S_AXI_ARESETN,

    // AXI4-Lite Write Address Channel
    input  wire [C_S_AXI_ADDR_WIDTH-1:0] S_AXI_AWADDR,
    input  wire  S_AXI_AWVALID,
    output wire  S_AXI_AWREADY,

    // AXI4-Lite Write Data Channel
    input  wire [C_S_AXI_DATA_WIDTH-1:0] S_AXI_WDATA,
    input  wire [(C_S_AXI_DATA_WIDTH/8)-1:0] S_AXI_WSTRB,
    input  wire  S_AXI_WVALID,
    output wire  S_AXI_WREADY,

    // AXI4-Lite Write Response Channel
    output wire [1:0] S_AXI_BRESP,
    output wire  S_AXI_BVALID,
    input  wire  S_AXI_BREADY,

    // AXI4-Lite Read Address Channel
    input  wire [C_S_AXI_ADDR_WIDTH-1:0] S_AXI_ARADDR,
    input  wire  S_AXI_ARVALID,
    output wire  S_AXI_ARREADY,

    // AXI4-Lite Read Data Channel
    output wire [C_S_AXI_DATA_WIDTH-1:0] S_AXI_RDATA,
    output wire [1:0] S_AXI_RRESP,
    output wire  S_AXI_RVALID,
    input  wire  S_AXI_RREADY,
    
    // Interrupt connecting to GIC (Generic Interrupt Controller)
    output wire  IRQ_READY
);

    // Internal H-Gate Signals
    wire [7:0]  hgate_addr;
    wire [31:0] hgate_wdata;
    wire [31:0] hgate_rdata;
    wire        hgate_we;
    wire        hgate_busy;
    
    // AXI Interface Logic (Simplified Slave Logic)
    reg aw_en;
    reg axi_awready;
    reg axi_wready;
    reg [1:0] axi_bresp;
    reg axi_bvalid;
    reg axi_arready;
    reg [C_S_AXI_DATA_WIDTH-1:0] axi_rdata;
    reg [1:0] axi_rresp;
    reg axi_rvalid;

    // Address Latch
    reg [C_S_AXI_ADDR_WIDTH-1:0] axi_awaddr;
    reg [C_S_AXI_ADDR_WIDTH-1:0] axi_araddr;

    assign S_AXI_AWREADY = axi_awready;
    assign S_AXI_WREADY  = axi_wready;
    assign S_AXI_BRESP   = axi_bresp;
    assign S_AXI_BVALID  = axi_bvalid;
    assign S_AXI_ARREADY = axi_arready;
    assign S_AXI_RDATA   = axi_rdata;
    assign S_AXI_RRESP   = axi_rresp;
    assign S_AXI_RVALID  = axi_rvalid;

    // H-Gate Core Instantiation
    hgate_top u_hgate (
        .clk(S_AXI_ACLK),
        .rst_n(S_AXI_ARESETN),
        .mmio_we(hgate_we),
        .mmio_addr(hgate_addr),
        .mmio_wdata(hgate_wdata),
        .mmio_rdata(hgate_rdata),
        .busy(hgate_busy)
    );

    // Map AXI logic to internal core MMIO (Write Path)
    assign hgate_we    = axi_wready && S_AXI_WVALID && axi_awready && S_AXI_AWVALID;
    assign hgate_addr  = axi_awaddr[7:0];
    assign hgate_wdata = S_AXI_WDATA;

    // AXI Write State Machine
    always @(posedge S_AXI_ACLK) begin
        if (!S_AXI_ARESETN) begin
            axi_awready <= 1'b0;
            axi_wready  <= 1'b0;
            axi_bvalid  <= 1'b0;
            aw_en       <= 1'b1;
        end else begin
            // Address Write
            if (~axi_awready && S_AXI_AWVALID && S_AXI_WVALID && aw_en) begin
                axi_awready <= 1'b1;
                aw_en       <= 1'b0;
                axi_awaddr  <= S_AXI_AWADDR;
            end else if (S_AXI_BREADY && axi_bvalid) begin
                aw_en       <= 1'b1;
                axi_awready <= 1'b0;
            end else begin
                axi_awready <= 1'b0;
            end

            // Data Write
            if (~axi_wready && S_AXI_WVALID && S_AXI_AWVALID && aw_en) begin
                axi_wready <= 1'b1;
            end else begin
                axi_wready <= 1'b0;
            end

            // Write Response
            if (axi_awready && S_AXI_AWVALID && ~axi_bvalid && axi_wready && S_AXI_WVALID) begin
                axi_bvalid <= 1'b1;
                axi_bresp  <= 2'b00; // OKAY
            end else begin
                if (S_AXI_BREADY && axi_bvalid) begin
                    axi_bvalid <= 1'b0;
                end
            end
        end
    end

    // AXI Read State Machine
    always @(posedge S_AXI_ACLK) begin
        if (!S_AXI_ARESETN) begin
            axi_arready <= 1'b0;
            axi_rvalid  <= 1'b0;
        end else begin
            if (~axi_arready && S_AXI_ARVALID && ~axi_rvalid) begin
                axi_arready <= 1'b1;
                axi_araddr  <= S_AXI_ARADDR;
            end else begin
                axi_arready <= 1'b0;
            end

            if (axi_arready && S_AXI_ARVALID && ~axi_rvalid) begin
                axi_rvalid <= 1'b1;
                axi_rresp  <= 2'b00; // OKAY
                axi_rdata  <= hgate_rdata; // Read from internal core
            end else if (axi_rvalid && S_AXI_RREADY) begin
                axi_rvalid <= 1'b0;
            end
        end
    end

    // Trigger IRQ when operation finishes (busy falls)
    reg hgate_busy_d;
    always @(posedge S_AXI_ACLK) begin
        hgate_busy_d <= hgate_busy;
    end
    assign IRQ_READY = (hgate_busy_d && !hgate_busy); // Falling edge of busy

endmodule
