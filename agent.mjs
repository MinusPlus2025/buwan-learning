export const scenarios = [
  {
    id: 'delayed-shipping', title: '延迟发货', difficulty: '入门', channel: '在线客服',
    customer: '我下单好几天了还没发货，问了也没人说清楚，到底什么时候能寄？',
    context: '客户订单超过其预期发货时间，当前练习信息不足以确认具体发货日期。',
    issueTerms: ['延迟发货', '发货', '订单', '物流'], issueSummary: '订单尚未按预期发出', nextAction: '核对订单状态和可查询到的物流信息',
    facts: ['本场景假设订单页面仍显示待发货，暂时没有可确认的发货日期。', '本场景没有提供仓库、物流或具体到货时间的核实结果。'],
    policy: ['本场景规则为虚构练习设定，不代表任何企业的真实政策。', '核实前不得承诺具体发货或到货时间，也不得擅自承诺补偿。'],
    goals: ['先承认等待带来的影响', '复述订单延迟发货的问题', '说明核对动作并给出可兑现的更新时间'],
    redFlags: ['未核实就保证发货或到货日期', '责怪客户没有耐心或没有看说明'],
    followUps: ['客户追问今天是否一定发货', '客户要求立即补偿']
  },
  {
    id: 'refund-dispute', title: '退款争议', difficulty: '进阶', channel: '在线客服',
    customer: '你们说退款已经处理了，可我的账户还没收到，这不是在敷衍我吗？',
    context: '客户认为退款状态与账户实际到账情况不一致，练习中没有提供支付渠道或流水查询结果。',
    issueTerms: ['退款', '到账', '账户', '支付'], issueSummary: '退款状态与账户到账情况不一致', nextAction: '核对退款记录、支付渠道和当前处理状态',
    facts: ['本场景假设客服界面显示退款已提交，但没有提供到账时间或支付渠道流水。', '提交退款与资金实际到账是不同状态，当前练习无法确认最终到账时间。'],
    policy: ['本场景规则为虚构练习设定，不代表任何企业的真实政策。', '不得将退款提交描述为已经到账，也不得在核实前保证到账时间或额外补偿。'],
    goals: ['认可客户对到账差异的担忧', '复述退款未到账的问题', '说明核查退款记录并约定反馈时间'],
    redFlags: ['把已提交退款说成资金已到账', '保证立即到账或擅自承诺额外赔偿', '指责客户没有耐心'],
    followUps: ['客户要求提供到账的确定时间', '客户表示要投诉或申请争议处理']
  },
  {
    id: 'service-outage', title: '服务中断', difficulty: '进阶', channel: '在线客服',
    customer: '服务突然用不了，工作都被耽误了，你们什么时候能恢复？',
    context: '客户报告服务无法使用并受到影响，练习没有提供故障范围或恢复时间。',
    issueTerms: ['服务', '中断', '无法使用', '恢复'], issueSummary: '服务中断并影响正常使用', nextAction: '核对服务状态、影响范围和最新排查进展',
    facts: ['本场景假设客户当前无法正常使用服务，尚未确认故障原因和影响范围。', '本场景没有提供服务恢复时间或客户数据受影响的结论。'],
    policy: ['本场景规则为虚构练习设定，不代表任何企业的真实政策。', '未获得核实结果前，不得保证恢复时间、数据状态或补偿方案。'],
    goals: ['承认服务不可用对客户工作的影响', '复述服务中断和客户关切', '说明排查动作并给出下一次更新时间'],
    redFlags: ['未经确认保证服务马上恢复', '武断认定客户设备或操作有问题', '擅自承诺补偿'],
    followUps: ['客户要求给出恢复的准确时间', '客户询问已产生的数据是否安全']
  }
];

const dimensionLabels = { empathy: '共情', clarity: '表达清晰', action: '明确行动与时限', boundary: '边界与尊重' };
const overpromisePattern = /(?:保证|承诺|一定|肯定|绝对|必定|马上|立刻|当场|立即)[^，。！？；\n]{0,16}(?:退款|赔偿|补偿|解决|恢复|免单|到账|发货|到货|修好)|(?:给|为|替).{0,4}(?:您|你).{0,4}(?:赔偿|补偿|免单)|(?:今天|明天|今晚|\d+\s*(?:分钟|小时|天)内)[^，。！？；\n]{0,8}(?:到账|发货|到货|恢复|修好)|(?:退款|赔偿|补偿|免单).{0,8}(?:马上|立刻|立即)|100\s*%|百分之百/u;
const blamePattern = /你自己|您自己|谁让你|你活该|怪你|不关我们|与我们无关|客户原因|(?:你|您)(?:自己的问题|的责任|应该早|没看说明|没按要求|操作不当|没有按要求)|(?:都是|因为).{0,8}(?:你|您).{0,8}(?:造成|导致)/u;
const negatedPattern = /(?:不|没|未|无|勿|别|避免|拒绝|禁止|不能|不会|无法|不得|不应|不宜|不要|并非|尚未|暂不|未曾|不再|不作|不予|不保证|不承诺|不确定|不一定|不可能|未经核实|未经确认|核实前|确认前|查询后再|核实后再|确认后再|检查后再|排查后再|核实后不|确认后不|检查后不|排查后不|避免作出|避免给出|避免承诺|不会作出|不会给出|不会承诺|不作出|不做出|不提供|不予提供|不作保证|不作承诺|不轻易承诺|不随意承诺|不擅自承诺|不提前承诺|不直接承诺|不立即承诺|不马上承诺|不保证会|不承诺会|不承诺能|不保证能|不保证一定|不承诺一定|不确定能否|不确定是否|无法确定|尚不确定|暂不确定|目前不确定|还不确定|并不确定|并不保证|并不承诺|不会保证|不会承诺|无法保证|无法承诺|不能保证|不能承诺|暂时不保证|暂时不承诺|不对结果|不承诺结果|不保证结果|不作结果承诺|不作结果保证|不承诺未经确认|不保证未经确认|未确认前|尚未确认前|尚未核实前|没有核实前|没有确认前|未经核实前|未经确认前)$/u;

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

export function validateEvaluationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('请求格式不正确');
  if (Object.keys(input).some(key => !['scenarioId', 'reply', 'attempt'].includes(key))) throw invalid('请求包含不支持的字段');
  if (typeof input.scenarioId !== 'string' || !scenarios.some(scenario => scenario.id === input.scenarioId)) throw invalid('scenarioId 无效');
  if (typeof input.reply !== 'string') throw invalid('reply 必须是文本');
  const reply = input.reply.trim();
  const length = Array.from(reply).length;
  if (length < 10 || length > 1000) throw invalid('reply 需为10至1000字');
  if (input.attempt !== 1 && input.attempt !== 2) throw invalid('attempt 只能是1或2');
  return { scenarioId: input.scenarioId, reply, attempt: input.attempt };
}

function matchEvidence(reply, pattern, { ignoreNegated = false } = {}) {
  const match = pattern.exec(reply);
  pattern.lastIndex = 0;
  if (!match) return null;
  const before = reply.slice(Math.max(0, match.index - 18), match.index);
  if (ignoreNegated && negatedPattern.test(before)) return null;
  return { quote: match[0], start: match.index, end: match.index + match[0].length };
}

function restatementEvidence(reply, scenario) {
  const pattern = /(?:您|你).{0,4}(?:提到|反馈|反映|遇到|说明|担心)[^。！？；\n]{0,35}/u;
  const evidence = matchEvidence(reply, pattern);
  return evidence && scenario.issueTerms.some(term => evidence.quote.includes(term)) ? evidence : null;
}

export function evaluateReply(scenarioId, reply, attempt = 1) {
  const input = validateEvaluationInput({ scenarioId, reply, attempt });
  const scenario = scenarios.find(item => item.id === input.scenarioId);
  const issuePattern = new RegExp(scenario.issueTerms.join('|'), 'u');
  const checks = [
    { dimension: 'empathy', points: 13, rule: '先承认感受或表达歉意', evidence: matchEvidence(input.reply, /理解|明白|能体会|抱歉|对不起|不好意思|让您.{0,8}(?:失望|不便|困扰|着急|担心)|感谢您.{0,8}(?:反馈|告知|提醒)/u), advice: '建议先承认客户受到的影响或表达歉意。' },
    { dimension: 'empathy', points: 12, rule: '复述客户反馈的具体问题', evidence: restatementEvidence(input.reply, scenario), advice: '建议用“您反馈……”复述本场景中的具体问题。' },
    { dimension: 'clarity', points: 12, rule: '点明当前场景中的问题对象', evidence: matchEvidence(input.reply, issuePattern), advice: `建议明确提到“${scenario.title}”相关问题。` },
    { dimension: 'clarity', points: 13, rule: '交代当前状态或核实依据', evidence: matchEvidence(input.reply, /目前|现阶段|截至|原因是|状态是|核实后|查询后|根据.{0,12}(?:记录|信息|结果)/u), advice: '建议说明已知状态、核实依据或尚待确认之处。' },
    { dimension: 'action', points: 12, rule: '提出具体可执行的处理动作', evidence: matchEvidence(input.reply, /核实|查询|排查|登记|反馈|联系|跟进|更新|检查|确认|提交|处理|核对|安排/u), advice: '建议写明接下来要核实、排查或跟进的具体动作。' },
    { dimension: 'action', points: 13, rule: '给出明确的更新时间或处理时限', evidence: matchEvidence(input.reply, /(?:今天|明天|后天|今晚)(?:\s*\d{1,2}(?:点(?:半|\d{1,2}分)?|[:：]\d{2}))?(?:前|内)?[^。！？；\n]{0,15}(?:更新|反馈|回复|告知)|(?:\d+|[一二两三四五六七八九十]+)\s*(?:分钟|小时|天|个工作日)(?:之?内|后)[^。！？；\n]{0,15}(?:更新|反馈|回复|告知)|\d{1,2}(?:点(?:半|\d{1,2}分)?|[:：]\d{2})前[^。！？；\n]{0,15}(?:更新|反馈|回复|告知)/u), advice: '建议给出可兑现的具体更新时间或处理时限。' },
    { dimension: 'boundary', points: 13, rule: '不作未经核实的结果承诺', inverse: true, evidence: matchEvidence(input.reply, overpromisePattern, { ignoreNegated: true }), advice: '避免保证退款、赔偿、发货、到账或恢复等未经核实的结果。' },
    { dimension: 'boundary', points: 12, rule: '不指责或贬低客户', inverse: true, evidence: matchEvidence(input.reply, blamePattern), advice: '避免归咎客户，使用中性、尊重的表达。' }
  ];
  const score = { empathy: 0, clarity: 0, action: 0, boundary: 0, total: 0 };
  const hits = [];
  const misses = [];
  const evidence = checks.map(check => {
    const passed = check.inverse ? !check.evidence : Boolean(check.evidence);
    const earned = passed ? check.points : 0;
    score[check.dimension] += earned;
    score.total += earned;
    (passed ? hits : misses).push(check.rule);
    return { dimension: check.dimension, rule: check.rule, passed, earned, possible: check.points, quote: check.evidence?.quote || '', detail: passed ? '已满足此规则。' : check.advice };
  });
  const priorityDimension = Object.keys(dimensionLabels).reduce((lowest, current) => score[current] < score[lowest] ? current : lowest);
  const priority = { dimension: priorityDimension, label: dimensionLabels[priorityDimension], suggestion: evidence.find(item => item.dimension === priorityDimension && !item.passed)?.detail || '保持当前表现。' };
  const improvedReply = `您好，理解这次${scenario.title}给您带来的影响。您反馈${scenario.issueSummary}，我会先${scenario.nextAction}，核实后再向您说明本练习设定下可行的处理方式。我会在【填写可兑现的具体时间】前向您更新进度；核实前不承诺未经确认的处理结果。感谢您告知。`;
  return { scenarioId: scenario.id, attempt: input.attempt, score, hits, misses, evidence, priority, improvedReply };
}
