// 全局常量:尺寸与物理手感(调手感就改这里)
export const TILE = 32;

// 玩家
export const P_W = 20, P_H = 26;
export const RUN_SPEED = 250;
export const ACCEL_GROUND = 2600;
export const ACCEL_AIR = 1800;
export const FRICTION_GROUND = 2400;
export const FRICTION_AIR = 350;
export const GRAVITY = 2300;
export const FALL_MAX = 900;
export const ICE_FRICTION = 0.22; // 冰面摩擦系数(能停住但依然滑)
export const JUMP_V = 760;        // 普通跳 ≈ 3.9 格高 / 4~5 格远
export const DJUMP_V = 680;       // 阿蓝二段跳(总高 ≈ 7 格)
export const BOOST_V = 1060;      // 踩伙伴头起跳(≈ 7 格,配合前冲可跨 8 格)
export const SPRING_V = 1080;     // 弹簧
export const DASH_V = 560;        // 阿橙冲刺速度
export const DASH_TIME = 0.16;    // 冲刺时长(≈ 90px + 惯性)
export const DASH_CD = 0.55;
export const COYOTE = 0.1;        // 土狼时间
export const JUMP_BUFFER = 0.12;  // 跳跃预输入
export const JUMP_CUT = 0.45;     // 松开跳跃键的截断系数
export const INVULN_TIME = 1.6;   // 重生无敌

// 变桥(趴下)
export const LIE_W = 72, LIE_H = 12;   // 人桥尺寸
export const LIE_HOLD = 0.32;          // 长按「喊」触发
export const TRAMP_BASE = 1120;        // 蹦床基础弹力
export const TRAMP_STEP = 105;         // 每次连续弹跳加力
export const TRAMP_MAX = 4;            // 充能上限
