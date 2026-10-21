#include "mobile_profile.h"
#include <cassert>
#include <cmath>
#include <iostream>

double profile_test_now = 0;

int main() {
    using namespace mobile_profile;
    Distribution distribution;
    for (unsigned i = 1; i <= 100; ++i) distribution.add(double(i) / 10);
    assert(distribution.count == 100);
    assert(std::abs(distribution.total - 505.0) < 1e-9);
    assert(distribution.maximum == 10);
    assert(distribution.percentile_upper(0.50) >= 5);
    assert(distribution.percentile_upper(0.50) <= 5 * 1.189207115002722);
    assert(distribution.percentile_upper(0.95) >= 9.5);
    assert(distribution.percentile_upper(0.99) >= 9.9);
    Distribution empty;
    assert(empty.percentile_upper(0.99) == 0);
    empty.add(-1);
    assert(empty.total == 0);
    Distribution overflow;
    overflow.add(100000);
    assert(overflow.percentile_upper(0.99) == 100000);
    {
        Scope parent(0);
        profile_test_now = 2;
        {
            Scope child(1);
            profile_test_now = 5;
        }
        profile_test_now = 10;
    }
    assert(inclusive[0].count == 1);
    assert(inclusive[0].total == 10);
    assert(exclusive[0].total == 7);
    assert(inclusive[1].total == 3);
    assert(exclusive[1].total == 3);
    assert(current == nullptr);
    report(60, 1);
    report(119, 2);
    assert(speed_mask == 3);
    assert(window_id == 0);
    report(120, 2);
    assert(window_id == 1);
    assert(inclusive[0].count == 0);
    assert(exclusive[0].count == 0);
    assert(!partial_window);
    report(30, 1);
    assert(partial_window);
    assert(window_start_frame == 30);
    std::cout << "profile synthetic checks passed\n";
}
