// fe_types.vh — Fundamental field-element types for Ed25519 (radix-2^51)
// Each limb holds up to 51 bits in a 64-bit container.
// A field element is represented as 5 limbs: fe51_t = {h[0], h[1], h[2], h[3], h[4]}
// where value = h[0] + h[1]*2^51 + h[2]*2^102 + h[3]*2^153 + h[4]*2^204

`ifndef FE_TYPES_VH
`define FE_TYPES_VH

typedef logic [63:0] limb_t;
typedef limb_t [4:0] fe51_t;

// Extended twisted Edwards point: (X:Y:Z:T) with X*Y = Z*T
typedef struct packed {
    fe51_t X;
    fe51_t Y;
    fe51_t Z;
    fe51_t T;
} point_ext_t;

`endif
