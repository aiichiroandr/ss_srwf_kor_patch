#pragma once
extern double profile_test_now;
inline double emscripten_get_now() { return profile_test_now; }
template<class... T> inline void profile_test_capture(T... values) { (void)sizeof...(values); }
#define EM_ASM(code, ...) profile_test_capture(__VA_ARGS__)
