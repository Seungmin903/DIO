"""Codec boundaries and malformed checkpoint rejection; no private fixtures."""
import importlib.util
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
from fontTools.ttLib.tables._g_l_y_f import Glyph

ROOT=Path(__file__).resolve().parents[1]

class OutlineCodec(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name)
        harness=cls.root/'CodecHarness.java'
        harness.write_text('''package expo.modules.diohandwriting;
import java.nio.file.*;import java.util.Arrays;
public class CodecHarness { public static void main(String[] a) throws Exception {
byte[] compact=OutlineFont.compactGlyph(Files.readAllBytes(Path.of(a[0])));
if(!Arrays.equals(compact,OutlineFont.compactGlyph(compact)))throw new AssertionError("not idempotent");
Files.write(Path.of(a[1]),compact);
}}''',encoding='utf-8')
        subprocess.run(['javac','-d',str(cls.root),str(ROOT/'modules/dio-handwriting/android/src/main/java/expo/modules/diohandwriting/OutlineFont.java'),str(harness)],check=True,capture_output=True)
    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()
    def compact(self,data,ok=True):
        source=self.root/'input.gly';target=self.root/'output.gly';source.write_bytes(data)
        result=subprocess.run(['java','-cp',str(self.root),'expo.modules.diohandwriting.CodecHarness',str(source),str(target)],capture_output=True)
        self.assertEqual(result.returncode==0,ok,result.stderr.decode(errors='replace'))
        return target.read_bytes() if ok else result.stderr
    def test_short_signed_zero_and_repeat_boundaries_preserve_all_data(self):
        deltas=[(0,0),(255,0),(-255,0),(256,-256),(-256,256),(32767,0),(-32768,0),(1,0)]+[(0,0)]*600
        instructions=b'\x00\x01\x02';n=len(deltas)
        raw=struct.pack('>hhhhhHH',1,-1,-256,32767,0,n-1,len(instructions))+instructions+b'\x41'+b'\x01'*(n-1)
        raw+=b''.join(struct.pack('>h',x) for x,y in deltas)+b''.join(struct.pack('>h',y) for x,y in deltas)
        packed=self.compact(raw);a,b=Glyph(raw),Glyph(packed);a.expand(None);b.expand(None)
        self.assertEqual(list(a.coordinates),list(b.coordinates));self.assertEqual(a.endPtsOfContours,b.endPtsOfContours)
        self.assertEqual([f&65 for f in a.flags],[f&65 for f in b.flags]);self.assertEqual(a.program.getBytecode(),b.program.getBytecode())
        self.assertLess(len(packed),len(raw)//4)
    def test_truncated_and_overlong_repeat_checkpoints_are_rejected(self):
        self.compact(b'\x00',False)
        raw=struct.pack('>hhhhhHH',1,0,0,0,0,2,0)+b'\x09\xff'
        self.assertIn(b'Invalid glyph flags',self.compact(raw,False))

if __name__=='__main__':unittest.main()
