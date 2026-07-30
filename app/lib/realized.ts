// lib/realized.ts — what the moves the user actually made have done.
//
// The distinction this module protects: a projection is what the strategy could
// do; this is what the logged moves have already changed. A user seven weeks in
// who opens the app to a six-figure "SAVED" headline learns that the app's
// numbers are marketing. So the figure that leads is the small, real one.
//
// Method, and its limits, stated plainly:
//   Interest is compared between two amortizations of the SAME loan — one from
//   the balance as it stands, one from that balance plus every dollar the user
//   has logged moving to principal — at today's rate and payment. The HELOC
//   interest required to replenish those draws is subtracted.
//
// That is honest about direction but approximate in size: it applies today's
// rate to moves made at whatever rate was in force then, and it ignores the
// scheduled principal that would have been paid down in between. Both
// simplifications pull the number DOWN, which is the correct direction for a
// figure the user will read as money in hand.
import { analyzeMove } from './moveDecision';

export interface RealizedInputs {
  /** Sum of every successfully logged principal move. */
  totalMoved: number;
  mortgageBalance: number;
  mortgageRate: number;
  monthlyPayment: number;
  helocRate: number;
  monthlySurplus: number;
  helocLimit: number;
}

export interface Realized {
  /**
   * Mortgage interest removed, net of HELOC interest paid.
   *
   * Null for TWO different reasons, and consumers have to tell them apart with
   * `totalMoved`: nothing has been logged yet, or the moves that were logged
   * carry a balance the surplus cannot repay, so the line's cost has no end
   * date and there is no net to state. See MoveAnalysis.netInterestSaved.
   */
  net: number | null;
  mortgageInterestRemoved: number;
  helocInterestPaid: number;
  monthsOffPayoff: number;
  totalMoved: number;
}

export function computeRealized(i: RealizedInputs): Realized {
  if (i.totalMoved <= 0 || i.mortgageBalance <= 0 || i.monthlyPayment <= 0) {
    return {
      net: null,
      mortgageInterestRemoved: 0,
      helocInterestPaid: 0,
      monthsOffPayoff: 0,
      totalMoved: Math.max(0, i.totalMoved),
    };
  }

  // The counterfactual: the same loan with the moved principal still on it.
  const a = analyzeMove({
    helocLimit:      i.helocLimit > 0 ? i.helocLimit : i.totalMoved,
    helocDrawn:      0,
    moveAmount:      i.totalMoved,
    monthlySurplus:  Math.max(0, i.monthlySurplus),
    helocRate:       i.helocRate,
    mortgageBalance: i.mortgageBalance + i.totalMoved,
    mortgageRate:    i.mortgageRate,
    monthlyPayment:  i.monthlyPayment,
  });

  return {
    net: a.netInterestSaved,
    mortgageInterestRemoved: a.mortgageInterestSaved,
    helocInterestPaid: a.helocInterestCost,
    monthsOffPayoff: a.monthsOffPayoff,
    totalMoved: i.totalMoved,
  };
}
