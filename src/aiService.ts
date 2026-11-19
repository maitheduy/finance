import { GoogleGenAI } from '@google/genai';
import { AISettings, TransactionType } from './types';

export interface ParsedTransactionResult {
  type: TransactionType;
  amount: number; // in thousands VND
  category: string;
  description: string;
  memberName: string;
  wallet: string;
}

export async function categorizeTransactionWithAI(
  inputText: string,
  aiSettings: AISettings,
  availableCategories: { expense: string[]; income: string[] },
  familyMembers: string[],
  wallets: string[]
): Promise<ParsedTransactionResult> {
  if (!aiSettings.enabled) {
    throw new Error('AI đang tắt. Vui lòng bật AI trong phần Cài đặt.');
  }

  const prompt = `Phân tích giao dịch tài chính từ câu nhập của người dùng bằng tiếng Việt.
Đơn vị tiền tệ đầu vào người dùng hay dùng là NGÀN ĐỒNG (ví dụ: 50 = 50.000đ, 1 triệu = 1000 ngàn đồng, 500k = 500 ngàn đồng). Nếu người dùng nói "50 nghìn" hoặc "50k", amount là 50. Nếu "1.5 triệu", amount là 1500.
Các danh mục chi phí có sẵn: ${availableCategories.expense.join(', ')}.
Các danh mục thu nhập có sẵn: ${availableCategories.income.join(', ')}.
Thành viên gia đình: ${familyMembers.join(', ')}.
Ví/Tài khoản: ${wallets.join(', ')}.

Hãy trả về kết quả thuần JSON (không markdown, không giải thích) với cấu trúc:
{
  "type": "expense" hoặc "income",
  "amount": con số (ngàn đồng),
  "category": "tên danh mục phù hợp nhất trong danh sách trên",
  "description": "mô tả ngắn gọn rõ ràng",
  "memberName": "thành viên phù hợp hoặc mặc định (${familyMembers[0] || 'Chung'})",
  "wallet": "ví phù hợp hoặc mặc định (${wallets[0] || 'Tiền mặt'})"
}

Câu của người dùng: "${inputText}"`;

  if (aiSettings.provider === 'gemini') {
    try {
      const ai = new GoogleGenAI({ apiKey: aiSettings.apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const text = response.text || '{}';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (err) {
      console.error('Gemini AI error:', err);
      throw new Error('Lỗi gọi Gemini AI. Kiểm tra lại API Key.');
    }
  } else if (aiSettings.provider === 'openai') {
    if (!aiSettings.apiKey) throw new Error('Chưa nhập OpenAI API Key.');
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } else if (aiSettings.provider === 'deepseek') {
    if (!aiSettings.apiKey) throw new Error('Chưa nhập DeepSeek API Key.');
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } else if (aiSettings.provider === 'grok') {
    if (!aiSettings.apiKey) throw new Error('Chưa nhập Grok API Key.');
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiSettings.apiKey}`
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      })
    });
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '{}';
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  }

  throw new Error('Nhà cung cấp AI không hợp lệ.');
}
