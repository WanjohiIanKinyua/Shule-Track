import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Users, ClipboardCheck, BookOpen, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ClassItem {
  id: string;
  name: string;
  stream: string | null;
  year: number;
  student_count?: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('Form 1');
  const [newStream, setNewStream] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('*')
      .order('name');
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }

    // Get student counts
    const classesWithCounts = await Promise.all(
      (data || []).map(async (c: any) => {
        const { count } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('class_id', c.id);
        return { ...c, student_count: count || 0 };
      })
    );
    setClasses(classesWithCounts);
    setLoading(false);
  };

  useEffect(() => { fetchClasses(); }, []);

  const handleCreate = async () => {
    if (!user) return;
    const { error } = await supabase.from('classes').insert({
      teacher_id: user.id,
      name: newName,
      stream: newStream || null,
      year: new Date().getFullYear(),
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Class created!' });
    setOpen(false);
    setNewStream('');
    fetchClasses();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('classes').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Class deleted' });
    fetchClasses();
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your classes and track student progress</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> New Class</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Class</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Class Name</Label>
                <Select value={newName} onValueChange={setNewName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Form 1">Form 1</SelectItem>
                    <SelectItem value="Form 2">Form 2</SelectItem>
                    <SelectItem value="Form 3">Form 3</SelectItem>
                    <SelectItem value="Form 4">Form 4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stream (optional)</Label>
                <Input placeholder="e.g. East, West, A, B" value={newStream} onChange={e => setNewStream(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleCreate}>Create Class</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {classes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="font-heading font-semibold text-lg mb-1">No classes yet</h3>
            <p className="text-muted-foreground text-sm">Create your first class to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(c => (
            <Card key={c.id} className="group hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/dashboard/students?classId=${c.id}`)}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg font-heading">{c.name}{c.stream ? ` - ${c.stream}` : ''}</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={e => { e.stopPropagation(); handleDelete(c.id); }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{c.year}</p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="h-4 w-4" /> {c.student_count} students</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
