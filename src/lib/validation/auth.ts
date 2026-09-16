import { z } from "zod";

// Zod en todo input (regla dura #6). Mensajes en espanol, sin filtrar detalles
// internos al usuario final.

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  email: z.string().trim().email("Correo electronico invalido."),
  phone: z.string().trim().min(7, "Telefono invalido.").optional().or(z.literal("")),
  password: z
    .string()
    .min(8, "La contrasena debe tener al menos 8 caracteres.")
    .max(72, "La contrasena es demasiado larga."),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email("Correo electronico invalido."),
  password: z.string().min(1, "La contrasena es obligatoria."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Correo electronico invalido."),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "La contrasena debe tener al menos 8 caracteres."),
    confirmPassword: z.string().min(8, "Confirma la contrasena."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contrasenas no coinciden.",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
