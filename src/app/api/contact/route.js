import nodemailer from 'nodemailer';

export async function POST(req) {
  try {
    const { name, email, mobile, message } = await req.json();

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'kannankannabiran@gmail.com', // 🔁 Replace with your Gmail
        pass: 'qqhb hlik mnkm maxz',   // 🔐 Use App Password
      },
    });

    const mailOptions = {
      from: email,
      to: 'kannankannabiran@gmail.com',
      subject: 'New Contact Form Submission',
      html: `
        <h3>New Contact Message</h3>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Mobile:</strong> ${mobile}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Message:</strong> ${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
