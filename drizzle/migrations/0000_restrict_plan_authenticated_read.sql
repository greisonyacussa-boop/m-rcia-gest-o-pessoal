DROP POLICY IF EXISTS "plans authenticated read" ON public.plan;
CREATE POLICY "plans authenticated read" ON public.plan FOR SELECT TO authenticated USING (ativo = true OR public.is_super_admin());