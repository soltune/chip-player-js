enum {
  PMD_SSGEFF_CNT = 0x28
};

// 0x00: 0x01: 0x0078
static const struct pmd_ssgeff_data pmd_ssgeff_00[] = {
  {0x01, 0x05dc, 0x1f, true,  true,  0x0f, 0x0000, 0x00,  127,   0,  0},
  {0x08, 0x06a4, 0x00, true,  false, 0x10, 0x04b0, 0x00,  127,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x01: 0x01: 0x008f
static const struct pmd_ssgeff_data pmd_ssgeff_01[] = {
  {0x0e, 0x0190, 0x07, true,  true,  0x10, 0x0bb8, 0x00,   93,  -1,  2},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x02: 0x01: 0x009b
static const struct pmd_ssgeff_data pmd_ssgeff_02[] = {
  {0x02, 0x02bc, 0x00, true,  true,  0x0f, 0x0000, 0x00,  100,   0,  0},
  {0x0e, 0x0384, 0x00, true,  true,  0x10, 0x09c4, 0x00,  100,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x03: 0x01: 0x00b2
static const struct pmd_ssgeff_data pmd_ssgeff_03[] = {
  {0x02, 0x01f4, 0x05, true,  true,  0x0f, 0x0000, 0x00,   60,   0,  0},
  {0x0e, 0x026c, 0x00, true,  true,  0x10, 0x09c4, 0x00,   60,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x04: 0x01: 0x00c9
static const struct pmd_ssgeff_data pmd_ssgeff_04[] = {
  {0x02, 0x012c, 0x00, true,  true,  0x0f, 0x0000, 0x00,   50,   0,  0},
  {0x0e, 0x0190, 0x00, true,  true,  0x10, 0x09c4, 0x00,   50,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x05: 0x01: 0x00e0
static const struct pmd_ssgeff_data pmd_ssgeff_05[] = {
  {0x02, 0x0037, 0x00, true,  false, 0x10, 0x012c, 0x00,  100,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x06: 0x01: 0x00ec
static const struct pmd_ssgeff_data pmd_ssgeff_06[] = {
  {0x10, 0x0000, 0x0f, false, true,  0x10, 0x0bb8, 0x00,    0,  -1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x07: 0x01: 0x00f8
static const struct pmd_ssgeff_data pmd_ssgeff_07[] = {
  {0x06, 0x0027, 0x00, true,  true,  0x10, 0x01f4, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x08: 0x01: 0x0104
static const struct pmd_ssgeff_data pmd_ssgeff_08[] = {
  {0x20, 0x0027, 0x00, true,  true,  0x10, 0x1388, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x09: 0x01: 0x0110
static const struct pmd_ssgeff_data pmd_ssgeff_09[] = {
  {0x1f, 0x0028, 0x1f, true,  true,  0x10, 0x1388, 0x00,    0,  -1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0a: 0x01: 0x011c
static const struct pmd_ssgeff_data pmd_ssgeff_0a[] = {
  {0x1f, 0x001e, 0x00, true,  true,  0x10, 0x1388, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0b: 0x02: 0x0128
static const struct pmd_ssgeff_data pmd_ssgeff_0b[] = {
  {0x03, 0x01dd, 0x0f, false, true,  0x10, 0x03e8, 0x00,    0,   7,  1},
  {0x02, 0x01dd, 0x00, false, true,  0x10, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0c: 0x02: 0x013f
static const struct pmd_ssgeff_data pmd_ssgeff_0c[] = {
  {0x01, 0x012c, 0x00, true,  false, 0x10, 0x012c, 0x0d,    0,   0,  0},
  {0x06, 0x012c, 0x00, true,  false, 0x10, 0x2710, 0x00,   80,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0d: 0x02: 0x0156
static const struct pmd_ssgeff_data pmd_ssgeff_0d[] = {
  {0x04, 0x01dd, 0x00, false, true,  0x0e, 0x2710, 0x00,    0,   5,  1},
  {0x04, 0x01dd, 0x0a, false, true,  0x10, 0x07d0, 0x00,    0,  -1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0e: 0x02: 0x016d
static const struct pmd_ssgeff_data pmd_ssgeff_0e[] = {
  {0x03, 0x01dd, 0x00, false, true,  0x10, 0x01f4, 0x0d,    0,   0,  0},
  {0x08, 0x01dd, 0x0f, false, true,  0x10, 0x07d0, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x0f: 0x02: 0x0184
static const struct pmd_ssgeff_data pmd_ssgeff_0f[] = {
  {0x03, 0x01dd, 0x0a, false, true,  0x10, 0x0064, 0x0d,    0,   0,  0},
  {0x10, 0x01dd, 0x05, false, true,  0x10, 0x2710, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x10: 0x02: 0x019b
static const struct pmd_ssgeff_data pmd_ssgeff_10[] = {
  {0x02, 0x0190, 0x00, true,  false, 0x10, 0x01f4, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x11: 0x02: 0x01a7
static const struct pmd_ssgeff_data pmd_ssgeff_11[] = {
  {0x04, 0x01dd, 0x0f, false, true,  0x10, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x12: 0x02: 0x01b3
static const struct pmd_ssgeff_data pmd_ssgeff_12[] = {
  {0x02, 0x01dd, 0x1f, false, true,  0x0f, 0x2710, 0x00,    0,   0,  0},
  {0x0c, 0x01dd, 0x00, false, true,  0x10, 0x1388, 0x00,    0,   1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x13: 0x02: 0x01ca
static const struct pmd_ssgeff_data pmd_ssgeff_13[] = {
  {0x02, 0x0190, 0x00, true,  false, 0x10, 0x03e8, 0x00,    0,   0,  0},
  {0x02, 0x00c8, 0x00, true,  false, 0x10, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x14: 0x02: 0x01e1
static const struct pmd_ssgeff_data pmd_ssgeff_14[] = {
  {0x04, 0x0190, 0x00, true,  false, 0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x08, 0x00c8, 0x00, true,  false, 0x10, 0x0bb8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x15: 0x02: 0x01f8
static const struct pmd_ssgeff_data pmd_ssgeff_15[] = {
  {0x03, 0x0190, 0x00, true,  false, 0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x03, 0x0064, 0x00, true,  false, 0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x03, 0x00c8, 0x00, true,  false, 0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x03, 0x0190, 0x00, true,  false, 0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x08, 0x0064, 0x00, true,  false, 0x10, 0x0bb8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x16: 0x02: 0x0230
static const struct pmd_ssgeff_data pmd_ssgeff_16[] = {
  {0x10, 0x07d0, 0x00, true,  false, 0x0f, 0x2710, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x17: 0x02: 0x023c
static const struct pmd_ssgeff_data pmd_ssgeff_17[] = {
  {0x04, 0x01dd, 0x1f, false, true,  0x10, 0x1388, 0x00,    0,   0,  0},
  {0x08, 0x01dd, 0x1f, true,  true,  0x10, 0x0bb8, 0x00,  127,  -1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x18: 0x02: 0x0253
static const struct pmd_ssgeff_data pmd_ssgeff_18[] = {
  {0x04, 0x01dd, 0x19, false, true,  0x10, 0x07d0, 0x00,    0,   0,  0},
  {0x20, 0x01dd, 0x14, false, true,  0x10, 0x1770, 0x00,    0,   1,  3},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x19: 0x02: 0x026a
static const struct pmd_ssgeff_data pmd_ssgeff_19[] = {
  {0x06, 0x00c8, 0x00, true,  true,  0x10, 0x1388, 0x00,   20,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1a: 0x02: 0x0276
static const struct pmd_ssgeff_data pmd_ssgeff_1a[] = {
  {0x04, 0x0028, 0x14, true,  true,  0x10, 0x2710, 0x00,   20,   0,  0},
  {0x10, 0x0014, 0x05, true,  true,  0x10, 0x1388, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1b: 0x02: 0x028d
static const struct pmd_ssgeff_data pmd_ssgeff_1b[] = {
  {0x06, 0x0258, 0x00, true,  false, 0x10, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1c: 0x02: 0x0299
static const struct pmd_ssgeff_data pmd_ssgeff_1c[] = {
  {0x04, 0x03e8, 0x00, true,  false, 0x10, 0x2710, 0x00,  127,   0,  0},
  {0x10, 0x01dd, 0x00, true,  true,  0x10, 0x2710, 0x00,   64,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1d: 0x02: 0x02b0
static const struct pmd_ssgeff_data pmd_ssgeff_1d[] = {
  {0x04, 0x03e8, 0x1f, true,  true,  0x0f, 0x2710, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1e: 0x02: 0x02bc
static const struct pmd_ssgeff_data pmd_ssgeff_1e[] = {
  {0x04, 0x0fff, 0x1f, true,  true,  0x0f, 0x2710, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x1f: 0x02: 0x02c8
static const struct pmd_ssgeff_data pmd_ssgeff_1f[] = {
  {0x04, 0x01dd, 0x00, true,  false, 0x10, 0x03e8, 0x00,  -50,   0,  0},
  {0x10, 0x00f2, 0x00, true,  false, 0x10, 0x1770, 0x00,   -8,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x20: 0x02: 0x02df
static const struct pmd_ssgeff_data pmd_ssgeff_20[] = {
  {0x04, 0x0064, 0x00, true,  false, 0x10, 0x01f4, 0x00,    0,   0,  0},
  {0x04, 0x000a, 0x00, true,  true,  0x10, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x21: 0x02: 0x02f6
static const struct pmd_ssgeff_data pmd_ssgeff_21[] = {
  {0x08, 0x01dd, 0x05, false, true,  0x10, 0x01f4, 0x0d,    0,   0,  0},
  {0x18, 0x001e, 0x00, true,  true,  0x10, 0x2710, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x22: 0x02: 0x030d
static const struct pmd_ssgeff_data pmd_ssgeff_22[] = {
  {0x04, 0x012c, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0x04, 0x00b4, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0x04, 0x00c8, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0x18, 0x0096, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x23: 0x02: 0x033a
static const struct pmd_ssgeff_data pmd_ssgeff_23[] = {
  {0x03, 0x00ee, 0x00, true,  false, 0x0e, 0x07d0, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x24: 0x02: 0x0346
static const struct pmd_ssgeff_data pmd_ssgeff_24[] = {
  {0x04, 0x00c8, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0x10, 0x0064, 0x00, true,  false, 0x10, 0x1388, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x25: 0x02: 0x035d
static const struct pmd_ssgeff_data pmd_ssgeff_25[] = {
  {0x10, 0x0000, 0x00, true,  true,  0x10, 0x01f4, 0x0d,    1,   1,  1},
  {0x10, 0x0010, 0x10, true,  true,  0x10, 0x157c, 0x00,    1,   1,  1},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x26: 0x02: 0x0374
static const struct pmd_ssgeff_data pmd_ssgeff_26[] = {
  {0x01, 0x00c8, 0x00, true,  false, 0x0e, 0x03e8, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};
// 0x27: 0x02: 0x0380
static const struct pmd_ssgeff_data pmd_ssgeff_27[] = {
  {0x02, 0x00c8, 0x00, true,  false, 0x10, 0x0320, 0x00,    0,   0,  0},
  {0x02, 0x0064, 0x00, true,  false, 0x10, 0x0320, 0x00,    0,   0,  0},
  {0x02, 0x0032, 0x00, true,  false, 0x10, 0x0320, 0x00,    0,   0,  0},
  {0x02, 0x0019, 0x00, true,  false, 0x10, 0x0320, 0x00,    0,   0,  0},
  {0xff, 0x0000, 0x00, false, false, 0x00, 0x0000, 0x00,    0,   0,  0}
};

static const struct {
  uint8_t priority;
  const struct pmd_ssgeff_data *data;
} pmd_ssgeff_table[PMD_SSGEFF_CNT] = {
  {1, pmd_ssgeff_00},
  {1, pmd_ssgeff_01},
  {1, pmd_ssgeff_02},
  {1, pmd_ssgeff_03},
  {1, pmd_ssgeff_04},
  {1, pmd_ssgeff_05},
  {1, pmd_ssgeff_06},
  {1, pmd_ssgeff_07},
  {1, pmd_ssgeff_08},
  {1, pmd_ssgeff_09},
  {1, pmd_ssgeff_0a},
  {2, pmd_ssgeff_0b},
  {2, pmd_ssgeff_0c},
  {2, pmd_ssgeff_0d},
  {2, pmd_ssgeff_0e},
  {2, pmd_ssgeff_0f},
  {2, pmd_ssgeff_10},
  {2, pmd_ssgeff_11},
  {2, pmd_ssgeff_12},
  {2, pmd_ssgeff_13},
  {2, pmd_ssgeff_14},
  {2, pmd_ssgeff_15},
  {2, pmd_ssgeff_16},
  {2, pmd_ssgeff_17},
  {2, pmd_ssgeff_18},
  {2, pmd_ssgeff_19},
  {2, pmd_ssgeff_1a},
  {2, pmd_ssgeff_1b},
  {2, pmd_ssgeff_1c},
  {2, pmd_ssgeff_1d},
  {2, pmd_ssgeff_1e},
  {2, pmd_ssgeff_1f},
  {2, pmd_ssgeff_20},
  {2, pmd_ssgeff_21},
  {2, pmd_ssgeff_22},
  {2, pmd_ssgeff_23},
  {2, pmd_ssgeff_24},
  {2, pmd_ssgeff_25},
  {2, pmd_ssgeff_26},
  {2, pmd_ssgeff_27},
};